import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './modules/auth/auth.routes';
import itemRoutes from './modules/items/items.routes';
import claimRoutes from './modules/claims/claims.routes';
import locationRoutes from './modules/locations/locations.routes';
import uploadRoutes from './modules/uploads/uploads.routes';
import { errorHandler, notFound } from './middleware/error-handler';

export const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/items', itemRoutes);
// 'claims' removed from the path to avoid redundancy since the
// claimRoutes already handle '/claims' and '/items/:id/claims'
// endpoints.
app.use('/api/v1/', claimRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/uploads', uploadRoutes);

app.use(notFound);
app.use(errorHandler);
