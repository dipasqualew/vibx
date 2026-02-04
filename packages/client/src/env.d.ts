declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent;
  export default component;
}

interface Window {
  __VIBX_SERVER_URL?: string;
}
