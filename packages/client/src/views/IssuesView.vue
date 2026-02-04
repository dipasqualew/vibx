<template>
  <v-container fluid class="issues-container">
    <v-row justify="center">
      <v-col cols="12" md="10" lg="8">
        <h1 class="text-h5 mb-4">Issues</h1>

        <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = ''">
          {{ error }}
        </v-alert>

        <v-progress-linear v-if="loading" indeterminate class="mb-4" />

        <v-list v-if="issues.length > 0" lines="two">
          <v-list-item
            v-for="issue in issues"
            :key="issue.id"
          >
            <template #prepend>
              <v-chip
                :color="statusColor(issue.status)"
                size="small"
                variant="tonal"
                class="mr-2"
              >
                {{ statusLabel(issue.status) }}
              </v-chip>
            </template>
            <v-list-item-title>{{ issue.title }}</v-list-item-title>
            <v-list-item-subtitle>{{ issue.ref }}</v-list-item-subtitle>
            <template #append>
              <v-menu>
                <template #activator="{ props }">
                  <v-btn
                    v-bind="props"
                    icon="mdi-play"
                    size="small"
                    variant="text"
                    class="issue-run-btn"
                    :loading="runningActionId !== null"
                  />
                </template>
                <v-list density="compact" class="issue-action-menu">
                  <v-list-item
                    v-for="action in actions"
                    :key="action.id"
                    :title="action.name"
                    @click="triggerAction(action.id, issue)"
                  />
                </v-list>
              </v-menu>
            </template>
          </v-list-item>
        </v-list>

        <v-alert v-else-if="!loading" type="info" variant="tonal">
          No open issues found.
        </v-alert>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { listIssues, listActions, runAction } from "../api.js";
import type { IssueListItem, Action } from "../api.js";

const issues = ref<IssueListItem[]>([]);
const actions = ref<Action[]>([]);
const loading = ref(false);
const error = ref("");
const runningActionId = ref<string | null>(null);

function statusColor(status: string): string {
  switch (status) {
    case "todo": return "blue-grey";
    case "in_progress": return "blue";
    case "in_review": return "purple";
    default: return "grey";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "todo": return "To Do";
    case "in_progress": return "In Progress";
    case "in_review": return "In Review";
    default: return status;
  }
}

async function triggerAction(actionId: string, issue: IssueListItem) {
  runningActionId.value = actionId;
  error.value = "";
  try {
    await runAction(actionId, issue);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to run action";
  } finally {
    runningActionId.value = null;
  }
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    issues.value = await listIssues();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load issues";
  } finally {
    loading.value = false;
  }
}

async function loadActions() {
  try {
    actions.value = await listActions();
  } catch {
    // actions are optional, don't block UI
  }
}

onMounted(() => {
  void load();
  void loadActions();
});
</script>

<style scoped>
.issues-container {
  padding-top: 24px;
}
</style>
