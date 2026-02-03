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
import { listIssues } from "../api.js";
import type { IssueListItem } from "../api.js";

const issues = ref<IssueListItem[]>([]);
const loading = ref(false);
const error = ref("");

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

onMounted(() => {
  void load();
});
</script>

<style scoped>
.issues-container {
  padding-top: 24px;
}
</style>
