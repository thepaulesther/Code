import { useState } from 'react';
import App from './App';
import { RecoveryScreen } from './components/RecoveryScreen';
import { defaultSettings, emptyData, openStore, quarantine, type StoreState } from './lib/store';

/**
 * Opens the saved data once, before the app starts. Data that can't be used safely shows the
 * recovery screen instead, and the app (which saves on every change) never starts on top of it.
 */
export default function Root() {
  const [state, setState] = useState<StoreState>(openStore);

  if (state.status === 'newer' || state.status === 'unreadable') {
    return (
      <RecoveryScreen
        kind={state.status}
        reason={state.status === 'unreadable' ? state.reason : ''}
        raw={state.raw}
        onStartFresh={() => {
          // Never replace it without keeping a copy first.
          if (!quarantine(state.raw)) return false;
          setState({ status: 'empty', data: emptyData(defaultSettings()) });
          return true;
        }}
      />
    );
  }

  return (
    <App
      initial={state.data}
      notice={
        state.status === 'migrated'
          ? 'Your saved data was upgraded to work with this version of Elora. A safety copy of the old data is kept in Settings › Your data.'
          : undefined
      }
    />
  );
}
