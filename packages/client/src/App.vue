<template>
  <v-app>
    <v-app-bar density="compact" color="surface">
      <v-app-bar-title>vibx2</v-app-bar-title>
      <template #append>
        <v-btn to="/" variant="text" size="small">Terminal</v-btn>
        <v-btn to="/issues" variant="text" size="small">Issues</v-btn>
        <v-btn to="/settings" variant="text" size="small">Settings</v-btn>
      </template>
    </v-app-bar>
    <v-main scrollable>
      <router-view />
    </v-main>
  </v-app>
</template>

