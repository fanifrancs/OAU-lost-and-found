import { Request, Response } from 'express';
import { sendClaimNotification } from '../../utils/email';
import { createClaim, getClaim, getItemClaims, reviewClaim } from './claims.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validString(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function validationError(res: Response, message: string): void {
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) return String(error.code);
  return undefined;
}

export async function submitClaimHandler(req: Request, res: Response): Promise<void> {
  try {
    const itemId = String(req.params.id);
    if (!uuidPattern.test(itemId)) { validationError(res, 'Item id must be a valid UUID.'); return; }
    if (!isObject(req.body) || !validString(req.body.proof_of_ownership, 10, 5000)) {
      validationError(res, 'proof_of_ownership must be between 10 and 5000 characters.'); return;
    }
    if (!req.user?.id) { res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }); return; }

    const result = await createClaim(itemId, req.user.id, req.body.proof_of_ownership.trim());
    if (result === 'NOT_FOUND') { res.status(404).json({ success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Item not found.' } }); return; }
    if (result === 'OWN_ITEM') { res.status(403).json({ success: false, error: { code: 'CANNOT_CLAIM_OWN_ITEM', message: 'You cannot submit a claim for your own item.' } }); return; }
    if (result === 'RESOLVED') { res.status(409).json({ success: false, error: { code: 'ITEM_NOT_OPEN', message: 'This item has already been resolved.' } }); return; }
    if (result === 'APPROVED_EXISTS') { res.status(409).json({ success: false, error: { code: 'ITEM_NOT_OPEN', message: 'A claim for this item has already been approved.' } }); return; }

    try {
      await sendClaimNotification(result.reporterEmail, result.itemTitle);
    } catch (notificationError) {
      console.error('Claim was recorded but reporter notification failed:', notificationError);
    }
    res.status(201).json({ success: true, message: 'Claim request submitted successfully.', data: { claim_id: result.id, status: result.status } });
  } catch (error) {
    if (errorCode(error) === '23505') {
      res.status(409).json({ success: false, error: { code: 'PENDING_CLAIM_EXISTS', message: 'You already have a pending claim for this item.' } });
      return;
    }
    console.error('Submit claim error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to submit the claim right now.' } });
  }
}

export async function listItemClaimsHandler(req: Request, res: Response): Promise<void> {
  try {
    const itemId = String(req.params.id);
    if (!uuidPattern.test(itemId)) { validationError(res, 'Item id must be a valid UUID.'); return; }
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      validationError(res, 'page must be positive and limit must be between 1 and 100.'); return;
    }
    if (!req.user?.id) { res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }); return; }

    const result = await getItemClaims(itemId, req.user.id, page, limit);
    if (result === 'NOT_FOUND') { res.status(404).json({ success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Item not found.' } }); return; }
    if (result === 'FORBIDDEN') { res.status(403).json({ success: false, error: { code: 'NOT_ITEM_REPORTER', message: 'Only the item reporter can review its claims.' } }); return; }
    res.status(200).json({ success: true, data: {
      claims: result.claims,
      pagination: { total_items: result.totalItems, current_page: page, total_pages: Math.ceil(result.totalItems / limit) },
    } });
  } catch (error) {
    console.error('List item claims error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve claims right now.' } });
  }
}

export async function getClaimHandler(req: Request, res: Response): Promise<void> {
  try {
    const claimId = String(req.params.id);
    if (!uuidPattern.test(claimId)) { validationError(res, 'Claim id must be a valid UUID.'); return; }
    if (!req.user?.id) { res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }); return; }
    const result = await getClaim(claimId, req.user.id);
    if (result === 'NOT_FOUND') { res.status(404).json({ success: false, error: { code: 'CLAIM_NOT_FOUND', message: 'Claim not found.' } }); return; }
    if (result === 'FORBIDDEN') { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot view this claim.' } }); return; }
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('Get claim error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve the claim right now.' } });
  }
}

export async function reviewClaimHandler(req: Request, res: Response): Promise<void> {
  try {
    const claimId = String(req.params.id);
    if (!uuidPattern.test(claimId)) { validationError(res, 'Claim id must be a valid UUID.'); return; }
    if (!isObject(req.body) || !['APPROVED', 'REJECTED'].includes(String(req.body.status))) {
      validationError(res, 'status must be APPROVED or REJECTED.'); return;
    }
    if (!req.user?.id) { res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }); return; }

    const result = await reviewClaim(claimId, req.user.id, req.body.status as 'APPROVED' | 'REJECTED');
    if (result === 'NOT_FOUND') { res.status(404).json({ success: false, error: { code: 'CLAIM_NOT_FOUND', message: 'Claim not found.' } }); return; }
    if (result === 'FORBIDDEN') { res.status(403).json({ success: false, error: { code: 'NOT_ITEM_REPORTER', message: 'Only the item reporter can review this claim.' } }); return; }
    if (result === 'ALREADY_DECIDED') { res.status(409).json({ success: false, error: { code: 'CLAIM_ALREADY_DECIDED', message: 'This claim has already been decided.' } }); return; }

    res.status(200).json({
      success: true,
      message: result.status === 'APPROVED' ? 'Claim approved. Contact details are available to the claimant on the item details endpoint.' : 'Claim rejected.',
      data: { claim_id: result.id, status: result.status },
    });
  } catch (error) {
    console.error('Review claim error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to review the claim right now.' } });
  }
}
