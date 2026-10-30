import { pool } from '../../config/db';

export interface ClaimPage {
  claims: unknown[];
  totalItems: number;
}

export async function createClaim(itemId: string, claimantId: string, proof: string): Promise<
  'NOT_FOUND' | 'OWN_ITEM' | 'RESOLVED' | 'APPROVED_EXISTS' | { id: string; status: string; reporterEmail: string; itemTitle: string }
> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemQuery = `
      SELECT i.id, i.reporter_id, i.status, u.email, i.title
       FROM items i JOIN users u ON u.id = i.reporter_id
       WHERE i.id = $1 FOR UPDATE OF i
    `;
    const itemValues = [itemId];
    const itemResult = await client.query<{ id: string; reporter_id: string; status: string; email: string; title: string }>(itemQuery, itemValues);
    const item = itemResult.rows[0];
    if (!item) { await client.query('ROLLBACK'); return 'NOT_FOUND'; }
    if (item.reporter_id === claimantId) { await client.query('ROLLBACK'); return 'OWN_ITEM'; }
    if (item.status === 'RESOLVED') { await client.query('ROLLBACK'); return 'RESOLVED'; }

    const approvedQuery = "SELECT id FROM claims WHERE item_id = $1 AND status = 'APPROVED' LIMIT 1";
    const approvedValues = [itemId];
    const approvedResult = await client.query(approvedQuery, approvedValues);
    if (approvedResult.rowCount) { await client.query('ROLLBACK'); return 'APPROVED_EXISTS'; }

    const claimQuery = `
      INSERT INTO claims (item_id, claimant_id, proof_of_ownership)
      VALUES ($1, $2, $3) RETURNING id, status
    `;
    const claimValues = [itemId, claimantId, proof];
    const claimResult = await client.query<{ id: string; status: string }>(claimQuery, claimValues);
    const updateItemQuery = "UPDATE items SET status = 'CLAIM_PENDING', updated_at = NOW() WHERE id = $1";
    const updateItemValues = [itemId];
    await client.query(updateItemQuery, updateItemValues);
    await client.query('COMMIT');

    return {
      id: claimResult.rows[0].id,
      status: claimResult.rows[0].status,
      reporterEmail: item.email,
      itemTitle: item.title,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getItemClaims(itemId: string, reporterId: string, page: number, limit: number): Promise<
  'NOT_FOUND' | 'FORBIDDEN' | ClaimPage
> {
  const itemQuery = 'SELECT reporter_id FROM items WHERE id = $1';
  const itemValues = [itemId];
  const item = await pool.query<{ reporter_id: string }>(itemQuery, itemValues);
  if (!item.rowCount) return 'NOT_FOUND';
  if (item.rows[0].reporter_id !== reporterId) return 'FORBIDDEN';

  const countQuery = 'SELECT COUNT(*)::text AS total FROM claims WHERE item_id = $1';
  const countValues = [itemId];
  const count = await pool.query<{ total: string }>(countQuery, countValues);
  const query = `
    SELECT id, item_id, claimant_id, proof_of_ownership, status, created_at
    FROM claims WHERE item_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3
  `;
  const values = [itemId, limit, (page - 1) * limit];
  const result = await pool.query(query, values);
  return { claims: result.rows, totalItems: Number(count.rows[0].total) };
}

export async function getClaim(claimId: string, userId: string): Promise<'NOT_FOUND' | 'FORBIDDEN' | unknown> {
  const query = `
    SELECT c.id AS claim_id, c.item_id, c.claimant_id, i.reporter_id,
            c.proof_of_ownership, c.status, c.created_at
     FROM claims c JOIN items i ON i.id = c.item_id WHERE c.id = $1
  `;
  const values = [claimId];
  const result = await pool.query(query, values);
  const claim = result.rows[0];
  if (!claim) return 'NOT_FOUND';
  if (claim.claimant_id !== userId && claim.reporter_id !== userId) return 'FORBIDDEN';
  delete claim.reporter_id;
  return claim;
}

export async function reviewClaim(claimId: string, reporterId: string, status: 'APPROVED' | 'REJECTED'): Promise<
  'NOT_FOUND' | 'FORBIDDEN' | 'ALREADY_DECIDED' | { id: string; status: string }
> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const query = `
      SELECT c.id, c.item_id, c.status, i.reporter_id
       FROM claims c JOIN items i ON i.id = c.item_id
       WHERE c.id = $1 FOR UPDATE OF c, i
    `;
    const values = [claimId];
    const result = await client.query<{ id: string; item_id: string; status: string; reporter_id: string }>(query, values);
    const claim = result.rows[0];
    if (!claim) { await client.query('ROLLBACK'); return 'NOT_FOUND'; }
    if (claim.reporter_id !== reporterId) { await client.query('ROLLBACK'); return 'FORBIDDEN'; }
    if (claim.status !== 'PENDING') { await client.query('ROLLBACK'); return 'ALREADY_DECIDED'; }

    if (status === 'APPROVED') {
      const rejectOtherClaimsQuery = "UPDATE claims SET status = 'REJECTED', reviewed_at = NOW() WHERE item_id = $1 AND id <> $2 AND status = 'PENDING'";
      const rejectOtherClaimsValues = [claim.item_id, claimId];
      await client.query(rejectOtherClaimsQuery, rejectOtherClaimsValues);
      const updateItemQuery = "UPDATE items SET status = 'CLAIM_PENDING', updated_at = NOW() WHERE id = $1";
      const updateItemValues = [claim.item_id];
      await client.query(updateItemQuery, updateItemValues);
    }

    const updateClaimQuery = 'UPDATE claims SET status = $1, reviewed_at = NOW() WHERE id = $2 RETURNING id, status';
    const updateClaimValues = [status, claimId];
    const updated = await client.query<{ id: string; status: string }>(updateClaimQuery, updateClaimValues);

    if (status === 'REJECTED') {
      const pendingQuery = "SELECT EXISTS (SELECT 1 FROM claims WHERE item_id = $1 AND status = 'PENDING') AS has_pending";
      const pendingValues = [claim.item_id];
      const pending = await client.query<{ has_pending: boolean }>(pendingQuery, pendingValues);
      const approvedQuery = "SELECT EXISTS (SELECT 1 FROM claims WHERE item_id = $1 AND status = 'APPROVED') AS has_approved";
      const approvedValues = [claim.item_id];
      const approved = await client.query<{ has_approved: boolean }>(approvedQuery, approvedValues);
      if (!pending.rows[0].has_pending && !approved.rows[0].has_approved) {
        const updateItemQuery = "UPDATE items SET status = 'OPEN', updated_at = NOW() WHERE id = $1";
        const updateItemValues = [claim.item_id];
        await client.query(updateItemQuery, updateItemValues);
      }
    }

    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
