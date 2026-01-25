import React, { createContext, useContext } from 'react';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { RunnableManager } from '../runnables/manager.js';
import type { RunnableInstance } from '../types.js';

type ManagerStoreState = {
  instances: RunnableInstance[];
  outputTicks: Record<string, number>;
};

export type ManagerStoreHook = UseBoundStore<StoreApi<ManagerStoreState>>;

export type ManagerStoreApi = {
  useStore: ManagerStoreHook;
  getState: () => ManagerStoreState;
  dispose: () => void;
};

const ManagerStoreContext = createContext<ManagerStoreApi | null>(null);

export function ManagerStoreProvider({
  store,
  children,
}: {
  store: ManagerStoreApi;
  children: React.ReactNode;
}) {
  return (
    <ManagerStoreContext.Provider value={store}>
      {children}
    </ManagerStoreContext.Provider>
  );
}

export function useManagerStore<T>(selector: (state: ManagerStoreState) => T): T {
  const store = useContext(ManagerStoreContext);
  if (!store) {
    throw new Error('ManagerStoreProvider is missing');
  }
  return store.useStore(selector);
}

export function createManagerStore(
  manager: RunnableManager,
  options: { flushIntervalMs?: number } = {}
): ManagerStoreApi {
  const useStore = create<ManagerStoreState>()(
    subscribeWithSelector(() => ({
      instances: manager.getAll(),
      outputTicks: {},
    }))
  );

  const pendingIds = new Set<string>();
  let flushTimer: NodeJS.Timeout | null = null;
  const flushIntervalMs = options.flushIntervalMs ?? 33;

  const setInstances = () => {
    const instances = manager.getAll();
    useStore.setState((state) => {
      const nextTicks: Record<string, number> = {};
      for (const instance of instances) {
        nextTicks[instance.id] = state.outputTicks[instance.id] ?? 0;
      }
      return { instances, outputTicks: nextTicks };
    });
  };

  const flushOutput = () => {
    flushTimer = null;
    if (pendingIds.size === 0) return;

    const ids = Array.from(pendingIds);
    pendingIds.clear();

    useStore.setState((state) => {
      const nextTicks = { ...state.outputTicks };
      for (const id of ids) {
        nextTicks[id] = (nextTicks[id] ?? 0) + 1;
      }
      return { outputTicks: nextTicks };
    });
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(flushOutput, flushIntervalMs);
  };

  const handleStatusChange = () => {
    setInstances();
  };

  const handleHiddenChange = () => {
    setInstances();
  };

  const handleOutput = (id: string) => {
    pendingIds.add(id);
    scheduleFlush();
  };

  manager.on('status-change', handleStatusChange);
  manager.on('hidden-change', handleHiddenChange);
  manager.on('output', handleOutput);

  setInstances();

  const dispose = () => {
    manager.off('status-change', handleStatusChange);
    manager.off('hidden-change', handleHiddenChange);
    manager.off('output', handleOutput);
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  return {
    useStore,
    getState: useStore.getState,
    dispose,
  };
}
