import { Router } from 'express';
import expressAsyncHandler from 'express-async-handler';
import {
  initiateGitHubOAuth,
  handleGitHubOAuthCallback,
  checkStatus,
  removeIntegration,
  endSession,
} from '../controllers/github.controller';

const router = Router();

router.get('/connect', expressAsyncHandler(initiateGitHubOAuth));
router.get('/callback', expressAsyncHandler(handleGitHubOAuthCallback));
router.get('/status', expressAsyncHandler(checkStatus));
router.delete('/remove', expressAsyncHandler(removeIntegration));
router.post('/logout', expressAsyncHandler(endSession));

export default router;
