/**
 * Global flag that signals a native system picker (ImagePicker, Camera,
 * DocumentPicker) is currently open.
 *
 * When this flag is true, the AppState "inactive/background" listener in
 * _layout.tsx must NOT lock the vault or navigate away — the app only went
 * to background because the OS launched a native picker UI, not because the
 * user left the app.
 */
export const pickerGuard = { active: false };
