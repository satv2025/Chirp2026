import { initLandingSession, bindErrorBoundary } from './ui.js';
import { redirectIfLoggedIn, watchAuthRedirect } from './sessionRedirect.js';

bindErrorBoundary();
redirectIfLoggedIn();
watchAuthRedirect();
initLandingSession();
