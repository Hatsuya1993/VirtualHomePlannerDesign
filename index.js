// MUST be first: registers a global <Image> decorator that neutralises
// null-uri sources. RN reads the decorator when Image first loads, so this has
// to run before `expo`/`App` (which transitively import Image).
import './utils/patchImage';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
