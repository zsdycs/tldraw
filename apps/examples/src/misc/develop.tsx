import 'tldraw/tldraw.css'
import { useFileSystem } from './file/useFileSystem'
import {
	Tldraw,
	DefaultMainMenu,
	EditSubmenu,
	ExportFileContentSubMenu,
	ExtrasGroup,
	PreferencesGroup,
	TLComponents,
	ViewSubmenu,
} from 'tldraw'

import { LocalFileMenu } from './file/FileMenu'

const components: TLComponents = {
	MainMenu: () => (
		<DefaultMainMenu>
			<LocalFileMenu />
			<EditSubmenu />
			<ViewSubmenu />
			<ExportFileContentSubMenu />
			<ExtrasGroup />
			<PreferencesGroup />
		</DefaultMainMenu>
	),
}

export default function Develop() {
	const fileSystemUiOverrides = useFileSystem({ isMultiplayer: false })
	return (
		<div className="tldraw__editor">
			<Tldraw
				persistenceKey="tldraw_example"
				onMount={(editor) => {
					;(window as any).app = editor
					;(window as any).editor = editor
				}}
				overrides={[fileSystemUiOverrides]}
				components={components}
			/>
		</div>
	)
}
