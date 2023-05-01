import { createMachine, assign } from "xstate";
import { log } from "xstate/lib/actions";
import { Task, TaskChange } from "@/types";

export const tasksMachine = createMachine(
  {
    id: "tasks",
    initial: "initializing",
    states: {
      initializing: {
        always: [
          {
            target: "ready",
            cond: "offlineQueueIsEmpty",
          },
          {
            target: "beforeSyncing",
            actions: "applyOfflineChanges",
          },
        ],
      },
      beforeSyncing: {
        always: [
          {
            target: "syncing",
            cond: "isOnline",
          },
          {
            target: "ready",
          },
        ],
      },
      syncing: {
        invoke: {
          src: "syncOfflineQueue",
          onDone: [
            {
              target: "afterSyncing",
              actions: "updateOfflineQueueWithSyncResult",
            },
          ],
          onError: [
            {
              target: "error",
            },
          ],
        },
      },
      error: {
        on: {
          RETRY_SYNC: [
            {
              target: "syncing",
              cond: "isOnline",
            },
            {
              actions: "TODO",
            },
          ],
        },
      },
      allSynced: {
        after: {
          "1000": {
            target: "#tasks.ready",
            actions: [],
            internal: false,
          },
        },
      },
      afterSyncing: {
        always: [
          {
            target: "allSynced",
            cond: "offlineQueueIsEmpty",
          },
          {
            target: "#tasks.ready.someFailedToSync",
          },
        ],
      },
      ready: {
        initial: "normal",
        states: {
          normal: {},
          someFailedToSync: {
            on: {
              DISCARD_FAILED_CHANGES: {
                target: "normal",
              },
            },
          },
        },
        on: {
          CHANGE: {
            target: "beforeSyncing",
            actions: ["applyChange", "pushToOfflineQueue"],
          },
          ONLINE: {
            target: "syncing",
            cond: "offlineQueueIsNotEmpty",
          },
        },
      },
    },
    on: {
      CHANGE: {
        actions: ["applyChange", "pushToOfflineQueue"],
      },
    },
    schema: {
      events: {} as
        | { type: "CHANGE"; data: TaskChange }
        | { type: "RETRY_SYNC" }
        | { type: "ONLINE" }
        | { type: "DISCARD_FAILED_CHANGES" },
      services: {} as {
        syncOfflineQueue: {
          data: {
            status: Record<string, "ok" | "error">;
          };
        };
      },
    },
    predictableActionArguments: true,
    preserveActionOrder: true,
    tsTypes: {} as import("./tasks-machine.typegen").Typegen0,
    context: {} as { tasks: Task[] },
  },
  {
    actions: {
      applyChange: assign({
        tasks: (context, event) => {
          const change = event.data;
          return applyChange(context.tasks, change);
        },
      }),
      applyOfflineChanges: assign({
        tasks: (context) => {
          const queue = getOfflineQueue();
          const updatedTasks = queue.reduce(applyChange, context.tasks);
          return updatedTasks;
        },
      }),
      pushToOfflineQueue: (context, event) => {
        setOfflineQueue((queue) => [...queue, event.data]);
      },
      updateOfflineQueueWithSyncResult: (context, event) => {
        setOfflineQueue((queue) =>
          queue.reduce((queue, change) => {
            const status = event.data.status[change.id];
            if (status === "ok") {
              return queue;
            } else {
              const updatedChange = { ...change, error: status };
              return [...queue, updatedChange];
            }
          }, [] as TaskChange[])
        );
      },
      TODO: log("TODO"),
    },
    guards: {
      isOnline: () => navigator.onLine,
      offlineQueueIsEmpty,
      offlineQueueIsNotEmpty: () => !offlineQueueIsEmpty(),
    },
    services: {
      syncOfflineQueue: (context, event) => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            const random = Math.round(Math.random() * 10);
            if (random % 2) {
              const queue = getOfflineQueue();
              resolve({
                status: Object.fromEntries<"ok" | "error">(
                  queue.map((c, i) => [c.id, "ok"])
                ),
              });
            } else {
              reject(new TypeError("Network wahala"));
            }
          }, 2000);
        });
      },
    },
  }
);

function getOfflineQueue(): TaskChange[] {
  const queueAsJSON = localStorage.getItem("taskChangeQueue") || "[]";
  return JSON.parse(queueAsJSON) as TaskChange[];
}

function setOfflineQueue(updaterFn: (queue: TaskChange[]) => TaskChange[]) {
  const queue = getOfflineQueue();
  const updatedQueue = updaterFn(queue);
  const updatedQueueAsJSON = JSON.stringify(updatedQueue);
  localStorage.setItem("taskChangeQueue", updatedQueueAsJSON);
}

function offlineQueueIsEmpty() {
  const queue = getOfflineQueue();
  return queue.length === 0;
}

function applyChange(tasks: Task[], change: TaskChange): Task[] {
  if (change.type === "create") {
    return [
      ...tasks,
      {
        id: change.taskId,
        name: change.taskName,
        created_at: change.timestamp,
        completed_at: null,
        edited_at: null,
      },
    ];
  } else if (change.type === "complete") {
    return tasks.map((task) =>
      task.id === change.taskId
        ? { ...task, completed_at: change.timestamp }
        : task
    );
  } else if (change.type === "delete") {
    return tasks.filter((task) => task.id !== change.taskId);
  } else {
    throw new Error();
  }
}

if (import.meta.env.DEV) {
  // @ts-ignore
  window.getq = getOfflineQueue;
  // @ts-ignore
  window.setq = setOfflineQueue;
}