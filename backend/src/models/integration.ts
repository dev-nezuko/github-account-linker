import mongoose, { Document, Schema } from 'mongoose';

export interface IIntegration extends Document {
  userId: mongoose.Types.ObjectId;
  provider: string;
  connectedAt: Date;
}

const IntegrationSchema: Schema = new Schema({
  userId: { type: mongoose.Types.ObjectId, required: true, ref: 'User', unique: true },
  provider: { type: String, required: true },
  connectedAt: { type: Date, required: true },
});

export default mongoose.model<IIntegration>('Integration', IntegrationSchema);
