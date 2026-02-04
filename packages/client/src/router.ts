import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: () => import("./views/TerminalView.vue"),
    },
    {
      path: "/issues",
      component: () => import("./views/IssuesView.vue"),
    },
    {
      path: "/actions",
      component: () => import("./views/ActionsView.vue"),
    },
    {
      path: "/settings",
      component: () => import("./views/SettingsView.vue"),
    },
  ],
});

export default router;
