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
    const itemResult = await client.query<{ id: string; reporter_id: string; status: string; email: string; title: string }>(
      `SELECT i.id, i.reporter_id, i.status, u.email, i.title
       FROM items i JOIN users u ON u.id = i.reporter_id
       WHERE i.id = $1 FOR UPDATE OF i`,
      [itemId],
    );
    const item = itemResult.rows[0];
    if (!item) { await client.query('ROLLBACK'); return 'NOT_FOUND'; }
    if (item.reporter_id === claimantId) { await client.query('ROLLBACK'); return 'OWN_ITEM'; }
    if (item.status === 'RESOLVED') { await client.query('ROLLBACK'); return 'RESOLVED'; }

    const approvedResult = await client.query(
      "SELECT id FROM claims WHERE item_id = $1 AND status = 'APPROVED' LIMIT 1",
      [itemId],
    );
    if (approvedResult.rowCount) { await client.query('ROLLBACK'); return 'APPROVED_EXISTS'; }

    const claimResult = await client.query<{ id: string; status: string }>(
      `INSERT INTO claims (item_id, claimant_id, proof_of_ownership)
       VALUES ($1, $2, $3) RETURNING id, status`,
      [itemId, claimantId, proof],
    );
    await client.query("UPDATE items SET status = 'CLAIM_PENDING', updated_at = NOW() WHERE id = $1", [itemId]);
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
  const item = await pool.query<{ reporter_id: string }>('SELECT reporter_id FROM items WHERE id = $1', [itemId]);
  if (!item.rowCount) return 'NOT_FOUND';
  if (item.rows[0].reporter_id !== reporterId) return 'FORBIDDEN';

  const count = await pool.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM claims WHERE item_id = $1', [itemId]);
  const result = await pool.query(
    `SELECT id, item_id, claimant_id, proof_of_ownership, status, created_at
     FROM claims WHERE item_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [itemId, limit, (page - 1) * limit],
  );
  return { claims: result.rows, totalItems: Number(count.rows[0].total) };
}

export async function getClaim(claimId: string, userId: string): Promise<'NOT_FOUND' | 'FORBIDDEN' | unknown> {
  const result = await pool.query(
    `SELECT c.id AS claim_id, c.item_id, c.claimant_id, i.reporter_id,
            c.proof_of_ownership, c.status, c.created_at
     FROM claims c JOIN items i ON i.id = c.item_id WHERE c.id = $1`,
    [claimId],
  );
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
    const result = await client.query<{ id: string; item_id: string; status: string; reporter_id: string }>(
      `SELECT c.id, c.item_id, c.status, i.reporter_id
       FROM claims c JOIN items i ON i.id = c.item_id
       WHERE c.id = $1 FOR UPDATE OF c, i`,
      [claimId],
    );
    const claim = result.rows[0];
    if (!claim) { await client.query('ROLLBACK'); return 'NOT_FOUND'; }
    if (claim.reporter_id !== reporterId) { await client.query('ROLLBACK'); return 'FORBIDDEN'; }
    if (claim.status !== 'PENDING') { await client.query('ROLLBACK'); return 'ALREADY_DECIDED'; }

    if (status === 'APPROVED') {
      await client.query(
        "UPDATE claims SET status = 'REJECTED', reviewed_at = NOW() WHERE item_id = $1 AND id <> $2 AND status = 'PENDING'",
        [claim.item_id, claimId],
      );
      await client.query("UPDATE items SET status = 'CLAIM_PENDING', updated_at = NOW() WHERE id = $1", [claim.item_id]);
    }

    const updated = await client.query<{ id: string; status: string }>(
      'UPDATE claims SET status = $1, reviewed_at = NOW() WHERE id = $2 RETURNING id, status',
      [status, claimId],
    );

    if (status === 'REJECTED') {
      const pending = await client.query<{ has_pending: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM claims WHERE item_id = $1 AND status = 'PENDING') AS has_pending",
        [claim.item_id],
      );
      const approved = await client.query<{ has_approved: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM claims WHERE item_id = $1 AND status = 'APPROVED') AS has_approved",
        [claim.item_id],
      );
      if (!pending.rows[0].has_pending && !approved.rows[0].has_approved) {
        await client.query("UPDATE items SET status = 'OPEN', updated_at = NOW() WHERE id = $1", [claim.item_id]);
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
