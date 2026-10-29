import { Request, Response } from 'express';
import { getLocations } from './locations.service';

export async function getLocationsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const locations = await getLocations();
    res.status(200).json({ success: true, data: locations });
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve locations right now.' } });
  }
}
