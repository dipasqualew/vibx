<template>
  <v-container class="settings-container" fluid>
    <v-row justify="center">
      <v-col cols="12" md="8" lg="6">
        <h1 class="text-h5 mb-4">Settings</h1>

        <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = ''">
          {{ error }}
        </v-alert>

        <v-alert v-if="saved" type="success" class="mb-4" closable @click:close="saved = false">
          Settings saved.
        </v-alert>

        <v-form @submit.prevent="save">
          <v-select
            v-model="form.issue_provider"
            label="Issue Provider"
            :items="['github']"
            variant="outlined"
            class="mb-2"
          />

          <v-text-field
            v-model="form.issue_provider__github__github_token"
            label="GitHub Token"
            type="password"
            variant="outlined"
            class="mb-2"
          />

          <v-autocomplete
            v-if="form.issue_provider === 'github' && form.issue_provider__github__github_token"
            v-model="form.issue_provider__github__repositories"
            :items="availableRepos"
            :loading="loadingRepos"
            label="Repositories"
            multiple
            chips
            closable-chips
            variant="outlined"
            class="mb-2"
          />

          <v-select
            v-model="form.default_agent_framework"
            label="Default Agent Framework"
            :items="['claude', 'mock-code']"
            variant="outlined"
            class="mb-2"
          />

          <v-btn type="submit" color="primary" :loading="loading">Save</v-btn>
        </v-form>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from "vue";
import type { UserSettings } from "@vibx2/shared";
import { DEFAULT_USER_SETTINGS } from "@vibx2/shared";
import { listGitHubRepositories } from "../api";

const form = reactive<UserSettings>({ ...DEFAULT_USER_SETTINGS });
const loading = ref(false);
const loadingRepos = ref(false);
const availableRepos = ref<string[]>([]);
const error = ref("");
const saved = ref(false);

async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) throw new Error(`Failed to load settings: ${res.status}`);
    const data = (await res.json()) as UserSettings;
    Object.assign(form, data);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load settings";
  }
}

async function save() {
  loading.value = true;
  saved.value = false;
  error.value = "";
  try {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) throw new Error(`Failed to save settings: ${res.status}`);
    const data = (await res.json()) as UserSettings;
    Object.assign(form, data);
    saved.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to save settings";
  } finally {
    loading.value = false;
  }
}

async function fetchRepos() {
  if (form.issue_provider !== "github" || !form.issue_provider__github__github_token) {
    availableRepos.value = [];
    return;
  }
  loadingRepos.value = true;
  try {
    availableRepos.value = await listGitHubRepositories();
  } catch {
    availableRepos.value = [];
  } finally {
    loadingRepos.value = false;
  }
}

watch(() => form.issue_provider__github__github_token, () => {
  void fetchRepos();
});

onMounted(async () => {
  await loadSettings();
  void fetchRepos();
});
</script>

<style scoped>
.settings-container {
  padding-top: 24px;
}
</style>
