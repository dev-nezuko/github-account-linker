import { Router } from 'express';
import {
  initiateGitHubOAuth,
  handleGitHubOAuthCallback,
  checkStatus,
  removeIntegration,
  endSession,
} from '../controllers/github.controller';

const router = Router();

router.get('/connect', initiateGitHubOAuth);
router.get('/callback', handleGitHubOAuthCallback);
router.get('/status', checkStatus);
router.delete('/remove', removeIntegration);
router.post('/logout', endSession);

export default router;
