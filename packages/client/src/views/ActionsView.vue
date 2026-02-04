<template>
  <v-container fluid class="actions-container">
    <v-row justify="center">
      <v-col cols="12" md="10" lg="8">
        <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = ''">
          {{ error }}
        </v-alert>

        <!-- Editor mode -->
        <template v-if="editing">
          <h1 class="text-h5 mb-4">{{ editingId ? "Edit Action" : "New Action" }}</h1>

          <v-text-field
            v-model="form.name"
            label="Action Name"
            variant="outlined"
            density="compact"
            class="mb-3"
          />

          <v-select
            v-model="form.scope"
            :items="scopeItems"
            label="Scope"
            variant="outlined"
            density="compact"
            class="mb-3"
          />

          <h2 class="text-h6 mb-2">Steps</h2>

          <div class="steps-list mb-3">
            <v-card
              v-for="(step, index) in form.steps"
              :key="index"
              variant="outlined"
              class="mb-2 step-card"
              draggable="true"
              @dragstart="onDragStart(index, $event)"
              @dragover.prevent="onDragOver(index)"
              @drop="onDrop(index)"
              @dragend="dragIndex = -1"
            >
              <v-card-text class="d-flex align-center ga-2">
                <v-icon class="drag-handle" style="cursor: grab">mdi-drag</v-icon>

                <v-chip size="small" variant="tonal" class="mr-2">{{ stepTypeLabel(step.type) }}</v-chip>

                <!-- change-issue-status -->
                <v-select
                  v-if="step.type === 'change-issue-status'"
                  v-model="(step as ActionStepChangeIssueStatus).targetStatus"
                  :items="statusOptions"
                  label="Target Status"
                  variant="outlined"
                  density="compact"
                  hide-details
                  style="max-width: 220px"
                />

                <!-- run-bash-command -->
                <v-text-field
                  v-if="step.type === 'run-bash-command'"
                  v-model="(step as ActionStepRunBashCommand).command"
                  label="Command"
                  variant="outlined"
                  density="compact"
                  hide-details
                  style="flex: 1"
                />

                <!-- sleep -->
                <v-text-field
                  v-if="step.type === 'sleep'"
                  v-model.number="(step as ActionStepSleep).durationSeconds"
                  label="Duration (seconds)"
                  type="number"
                  variant="outlined"
                  density="compact"
                  hide-details
                  style="max-width: 180px"
                />

                <v-btn icon="mdi-delete" size="small" variant="text" @click="removeStep(index)" />
              </v-card-text>
            </v-card>
          </div>

          <v-menu>
            <template #activator="{ props }">
              <v-btn v-bind="props" variant="tonal" size="small" class="mb-4">Add Step</v-btn>
            </template>
            <v-list density="compact">
              <v-list-item title="Change Issue Status" @click="addStep('change-issue-status')" />
              <v-list-item title="Run Bash Command" @click="addStep('run-bash-command')" />
              <v-list-item title="Sleep" @click="addStep('sleep')" />
            </v-list>
          </v-menu>

          <div class="d-flex ga-2">
            <v-btn color="primary" @click="save" :loading="saving">Save</v-btn>
            <v-btn variant="text" @click="cancelEdit">Cancel</v-btn>
          </div>
        </template>

        <!-- List mode -->
        <template v-else>
          <div class="d-flex align-center mb-4">
            <h1 class="text-h5">Actions</h1>
            <v-spacer />
            <v-btn color="primary" size="small" @click="startCreate">New Action</v-btn>
          </div>

          <v-progress-linear v-if="loading" indeterminate class="mb-4" />

          <v-list v-if="actions.length > 0" lines="two">
            <v-list-item
              v-for="action in actions"
              :key="action.id"
              @click="startEdit(action)"
            >
              <template #prepend>
                <v-chip size="small" variant="tonal" class="mr-2">
                  {{ action.scope === "global" ? "global" : action.scope }}
                </v-chip>
              </template>
              <v-list-item-title>{{ action.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ action.steps.length }} step(s)</v-list-item-subtitle>
              <template #append>
                <v-btn
                  icon="mdi-play"
                  size="small"
                  variant="text"
                  class="action-run-btn"
                  @click.stop="run(action.id)"
                />
                <v-btn
                  icon="mdi-delete"
                  size="small"
                  variant="text"
                  @click.stop="remove(action.id)"
                />
              </template>
            </v-list-item>
          </v-list>

          <v-alert v-else-if="!loading" type="info" variant="tonal">
            No actions found.
          </v-alert>
        </template>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
import {
  listActions,
  createAction,
  updateAction,
  deleteAction,
  runAction,
  listGitHubRepositories,
} from "../api.js";
import type { Action } from "../api.js";
import type {
  ActionStep,
  ActionStepChangeIssueStatus,
  ActionStepRunBashCommand,
  ActionStepSleep,
} from "@vibx/shared";

const actions = ref<Action[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const editing = ref(false);
const editingId = ref<string | null>(null);
const repos = ref<string[]>([]);

const form = reactive<{
  name: string;
  scope: string;
  steps: ActionStep[];
}>({
  name: "",
  scope: "global",
  steps: [],
});

const statusOptions = [
  { title: "To Do", value: "todo" },
  { title: "In Progress", value: "in_progress" },
  { title: "In Review", value: "in_review" },
  { title: "Done", value: "done" },
  { title: "Won't Do", value: "wont_do" },
];

const scopeItems = computed(() => [
  { title: "Global", value: "global" },
  ...repos.value.map((r) => ({ title: r, value: r })),
]);

function stepTypeLabel(type: string): string {
  switch (type) {
    case "change-issue-status": return "Change Status";
    case "run-bash-command": return "Bash Command";
    case "sleep": return "Sleep";
    default: return type;
  }
}

// Drag-and-drop state
const dragIndex = ref(-1);

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index;
  event.dataTransfer?.setData("text/plain", String(index));
}

function onDragOver(index: number) {
  // visual feedback could be added here
  void index;
}

function onDrop(targetIndex: number) {
  if (dragIndex.value < 0 || dragIndex.value === targetIndex) return;
  const moved = form.steps.splice(dragIndex.value, 1)[0];
  form.steps.splice(targetIndex, 0, moved);
  dragIndex.value = -1;
}

function addStep(type: ActionStep["type"]) {
  switch (type) {
    case "change-issue-status":
      form.steps.push({ type: "change-issue-status", targetStatus: "todo" });
      break;
    case "run-bash-command":
      form.steps.push({ type: "run-bash-command", command: "" });
      break;
    case "sleep":
      form.steps.push({ type: "sleep", durationSeconds: 1 });
      break;
  }
}

function removeStep(index: number) {
  form.steps.splice(index, 1);
}

function startCreate() {
  editingId.value = null;
  form.name = "";
  form.scope = "global";
  form.steps = [];
  editing.value = true;
}

function startEdit(action: Action) {
  editingId.value = action.id;
  form.name = action.name;
  form.scope = action.scope;
  form.steps = JSON.parse(JSON.stringify(action.steps));
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
  editingId.value = null;
}

async function save() {
  saving.value = true;
  error.value = "";
  try {
    const payload = { name: form.name, scope: form.scope, steps: [...form.steps] };
    if (editingId.value) {
      await updateAction(editingId.value, payload);
    } else {
      await createAction(payload);
    }
    editing.value = false;
    editingId.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to save action";
  } finally {
    saving.value = false;
  }
}

async function remove(id: string) {
  error.value = "";
  try {
    await deleteAction(id);
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to delete action";
  }
}

async function run(id: string) {
  error.value = "";
  try {
    await runAction(id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to run action";
  }
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    actions.value = await listActions();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load actions";
  } finally {
    loading.value = false;
  }
}

async function loadRepos() {
  try {
    repos.value = await listGitHubRepositories();
  } catch {
    // repos are optional, don't block UI
  }
}

onMounted(() => {
  void load();
  void loadRepos();
});
</script>

<style scoped>
.actions-container {
  padding-top: 24px;
}

.step-card:hover {
  border-color: rgb(var(--v-theme-primary));
}

.drag-handle:hover {
  color: rgb(var(--v-theme-primary));
}
</style>
