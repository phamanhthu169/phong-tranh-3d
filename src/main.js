import { SceneManager }    from './core/SceneManager.js';
import { LandingScene }    from './scenes/LandingScene.js';
import { LoginScene }      from './scenes/LoginScene.js';
import { RegisterScene }   from './scenes/RegisterScene.js';
import { DashboardScene }  from './scenes/DashboardScene.js';
import { StudioScene }     from './scenes/StudioScene.js';
import { ExploreScene }    from './scenes/ExploreScene.js';
import { ViewerScene }     from './scenes/ViewerScene.js';
import { ProfileScene }    from './scenes/ProfileScene.js';
import { ForumScene }      from './scenes/ForumScene.js';
import { PreviewScene } from './scenes/PreviewScene.js';


const manager = new SceneManager();

manager
  .register('landing',   LandingScene)
  .register('login',     LoginScene)
  .register('register',  RegisterScene)
  .register('dashboard', DashboardScene)
  .register('studio',    StudioScene)
  .register('explore',   ExploreScene)
  .register('viewer',    ViewerScene)
  .register('profile',   ProfileScene)
  .register('forum',     ForumScene)
  .register('preview', PreviewScene);

// Chờ auth xác định trạng thái trước khi mở scene đầu tiên
// (tránh nhấp nháy khi đã đăng nhập mà bị redirect về login)
await manager.auth.ready();

const initialScene = manager.sceneFromCurrentPath();
history.replaceState({ scene: initialScene }, '', location.pathname);
manager.navigateTo(initialScene, false);
