import './style.css';
import { SceneManager }    from './core/SceneManager.js';
import { LandingScene }    from './scenes/LandingScene.js';
import { LoginScene }      from './scenes/LoginScene.js';
import { RegisterScene }   from './scenes/RegisterScene.js';
import { ForgotPasswordScene } from './scenes/ForgotPasswordScene.js';
import { DashboardScene }  from './scenes/DashboardScene.js';
import { StudioScene }     from './scenes/StudioScene.js';
import { ExploreScene }    from './scenes/ExploreScene.js';
import { ViewerScene }     from './scenes/ViewerScene.js';
import { ProfileScene }    from './scenes/ProfileScene.js';
import { ForumScene }      from './scenes/ForumScene.js';
import { PreviewScene }        from './scenes/PreviewScene.js';
import { CheckoutScene }       from './scenes/CheckoutScene.js';
import { OrdersScene }         from './scenes/OrdersScene.js';
import { OrderTrackingScene }  from './scenes/OrderTrackingScene.js';
import { SettingsScene }       from './scenes/SettingsScene.js';
import { PricingScene }        from './scenes/PricingScene.js';
import { SupportScene }        from './scenes/SupportScene.js';
import { AdminScene }          from './scenes/AdminScene.js';


const manager = new SceneManager();

manager
  .register('landing',   LandingScene)
  .register('login',     LoginScene)
  .register('register',  RegisterScene)
  .register('forgot-password', ForgotPasswordScene)
  .register('dashboard', DashboardScene)
  .register('studio',    StudioScene)
  .register('explore',   ExploreScene)
  .register('viewer',    ViewerScene)
  .register('profile',   ProfileScene)
  .register('forum',     ForumScene)
  .register('preview',    PreviewScene)
  .register('checkout',   CheckoutScene)
  .register('orders',     OrdersScene)
  .register('my-orders',  OrderTrackingScene)
  .register('settings',   SettingsScene)
  .register('pricing',    PricingScene)
  .register('support',    SupportScene)
  .register('admin',      AdminScene);

// Chờ auth xác định trạng thái trước khi mở scene đầu tiên
// (tránh nhấp nháy khi đã đăng nhập mà bị redirect về login)
await manager.auth.ready();

const initialScene = manager.sceneFromCurrentPath();
history.replaceState({ scene: initialScene }, '', location.pathname + location.search);
manager.navigateTo(initialScene, false);