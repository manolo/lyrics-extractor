# Issue: Escape key does not close extension dialogs

## Summary

Extension dialogs (`pluginType: "dialog"`) do not close when pressing Escape, despite the dialog wrapper (`ExtensionViewerDialog.qml`) using `StyledDialogView` which has `closeOnEscape: true`.

## Expected behavior

Pressing Escape should close the extension dialog, as it does with native MuseScore dialogs.

## Root cause analysis

### Dialog wrapping chain

1. Extension QML (e.g. `LyricsForm.qml`) is loaded by `ExtensionBuilder`
2. Wrapped in `ExtensionViewer` (a Rectangle)
3. Displayed via `ExtensionViewerDialog.qml`, which extends `StyledDialogView`

### Escape handling mechanism

`StyledDialogView.qml` (line 42, 87-90):
```qml
property bool closeOnEscape: true

NavigationSection {
    id: navSec
    type: NavigationSection.Exclusive
    enabled: root.isOpened

    onNavigationEvent: function(event) {
        if (event.type === NavigationEvent.Escape && root.closeOnEscape) {
            root.close()
        }
    }
}
```

Escape is handled through MuseScore's custom `NavigationSection`/`NavigationEvent` system, not through Qt Quick's `Keys` attached property.

### Why it fails for extensions

The `NavigationSection` only receives events when it is **active** in the navigation system. Extension plugin QML does not contain any `NavigationPanel` or navigation controls, so the navigation system never activates the dialog's section. Without an active section, Escape events are never routed to the `onNavigationEvent` handler.

### What does NOT work from plugin QML

- `Keys.onEscapePressed`: requires keyboard focus on the specific item, lost as soon as user interacts with any control
- `Shortcut { sequence: "Escape" }`: not available or not functional in the extension QML engine context
- `FocusScope` with `Keys.forwardTo`: same focus loss problem

## Relevant source files

| File | Role |
|------|------|
| `src/framework/extensions/qml/Muse/Extensions/ExtensionViewerDialog.qml` | Wraps extension in StyledDialogView |
| `src/framework/uicomponents/qml/Muse/UiComponents/StyledDialogView.qml` | Base dialog with closeOnEscape (line 42, 87-90) |
| `src/framework/extensions/view/extensionbuilder.cpp` | Creates ExtensionViewer, connects closeRequested |
| `src/framework/extensions/internal/legacy/extpluginrunner.cpp` | Runs legacy plugins |
| `src/framework/ui/view/navigationevent.h` | NavigationEvent with Escape enum |

## Existing plugins

None of the bundled MuseScore plugins (`tuning_modal`, `lilyrics`, `tuning`, `mirror-intervals`) handle Escape explicitly. They all rely on the wrapper, which suggests this is a known limitation or that the navigation system worked differently in earlier versions.

## Possible fix (MuseScore side)

In `StyledDialogView.qml`, add a fallback `Keys` handler on the `FocusScope` that does not depend on the navigation system:

```qml
contentItem: FocusScope {
    id: rootContainer
    focus: true
    Keys.onEscapePressed: {
        if (root.closeOnEscape) root.close()
    }
    // ... existing code
}
```

Or ensure the `NavigationSection` is activated when the dialog opens, even if the plugin content has no navigation panels.

## Workaround (plugin side)

None available. The extension QML engine does not provide access to the navigation system or the dialog wrapper.
