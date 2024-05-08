import {
	DefaultColorThemePalette,
	DefaultFontFamilies,
	DefaultFontStyle,
	FileHelpers,
	SvgExportDef,
	TLDefaultFillStyle,
	TLDefaultFontStyle,
	TLShapeUtilCanvasSvgDef,
	debugFlags,
	useEditor,
} from '@tldraw/editor'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDefaultColorTheme } from './ShapeFill'

/** @internal */
export const HASH_PATTERN_ZOOM_NAMES: Record<string, string> = {}

const HASH_PATTERN_COUNT = 6

for (let zoom = 1; zoom <= HASH_PATTERN_COUNT; zoom++) {
	HASH_PATTERN_ZOOM_NAMES[zoom + '_dark'] = `hash_pattern_zoom_${zoom}_dark`
	HASH_PATTERN_ZOOM_NAMES[zoom + '_light'] = `hash_pattern_zoom_${zoom}_light`
}

/** @public */
export function getFontDefForExport(fontStyle: TLDefaultFontStyle): SvgExportDef {
	return {
		key: `${DefaultFontStyle.id}:${fontStyle}`,
		getElement: async () => {
			const font = findFont(fontStyle)
			if (!font) return null

			const url: string = (font as any).$$_url
			const fontFaceRule: string = (font as any).$$_fontface
			if (!url || !fontFaceRule) return null

			const fontFile = await (await fetch(url)).blob()
			const base64FontFile = await FileHelpers.blobToDataUrl(fontFile)

			const newFontFaceRule = fontFaceRule.replace(url, base64FontFile)
			return <style>{newFontFaceRule}</style>
		},
	}
}

function findFont(name: TLDefaultFontStyle): FontFace | null {
	const fontFamily = DefaultFontFamilies[name]
	for (const font of document.fonts) {
		if (fontFamily.includes(font.family)) {
			return font
		}
	}
	return null
}

/** @public */
export function getFillDefForExport(fill: TLDefaultFillStyle): SvgExportDef {
	return {
		key: `${DefaultFontStyle.id}:${fill}`,
		getElement: async () => {
			if (fill !== 'pattern') return null

			return <HashPatternForExport />
		},
	}
}

function HashPatternForExport() {
	const theme = useDefaultColorTheme()
	const t = 8 / 12
	return (
		<>
			<mask id="hash_pattern_mask">
				<rect x="0" y="0" width="8" height="8" fill="white" />
				<g strokeLinecap="round" stroke="black">
					<line x1={t * 1} y1={t * 3} x2={t * 3} y2={t * 1} />
					<line x1={t * 5} y1={t * 7} x2={t * 7} y2={t * 5} />
					<line x1={t * 9} y1={t * 11} x2={t * 11} y2={t * 9} />
				</g>
			</mask>
			<pattern
				id={HASH_PATTERN_ZOOM_NAMES[`1_${theme.id}`]}
				width="8"
				height="8"
				patternUnits="userSpaceOnUse"
			>
				<rect x="0" y="0" width="8" height="8" fill={theme.solid} mask="url(#hash_pattern_mask)" />
			</pattern>
		</>
	)
}

export function getFillDefForCanvas(): TLShapeUtilCanvasSvgDef {
	return {
		key: `${DefaultFontStyle.id}:pattern`,
		component: PatternFillDefForCanvas,
	}
}
const TILE_PATTERN_SIZE = 8

const generateImage = (dpr: number, currentZoom: number, darkMode: boolean) => {
	return new Promise<Blob>((resolve, reject) => {
		const size = TILE_PATTERN_SIZE * currentZoom * dpr

		const canvasEl = document.createElement('canvas')
		canvasEl.width = size
		canvasEl.height = size

		const ctx = canvasEl.getContext('2d')
		if (!ctx) return

		ctx.fillStyle = darkMode
			? DefaultColorThemePalette.darkMode.solid
			: DefaultColorThemePalette.lightMode.solid
		ctx.fillRect(0, 0, size, size)

		// This essentially generates an inverse of the pattern we're drawing.
		ctx.globalCompositeOperation = 'destination-out'

		ctx.lineCap = 'round'
		ctx.lineWidth = 1.25 * currentZoom * dpr

		const t = 8 / 12
		const s = (v: number) => v * currentZoom * dpr

		ctx.beginPath()
		ctx.moveTo(s(t * 1), s(t * 3))
		ctx.lineTo(s(t * 3), s(t * 1))

		ctx.moveTo(s(t * 5), s(t * 7))
		ctx.lineTo(s(t * 7), s(t * 5))

		ctx.moveTo(s(t * 9), s(t * 11))
		ctx.lineTo(s(t * 11), s(t * 9))
		ctx.stroke()

		canvasEl.toBlob((blob) => {
			if (!blob || debugFlags.throwToBlob.get()) {
				reject()
			} else {
				resolve(blob)
			}
		})
	})
}

const canvasBlob = (size: [number, number], fn: (ctx: CanvasRenderingContext2D) => void) => {
	const canvas = document.createElement('canvas')
	canvas.width = size[0]
	canvas.height = size[1]
	const ctx = canvas.getContext('2d')
	if (!ctx) return ''
	fn(ctx)
	return canvas.toDataURL()
}
type PatternDef = { zoom: number; url: string; darkMode: boolean }

const getDefaultPatterns = () => {
	const defaultPatterns: PatternDef[] = []
	for (let i = 1; i <= HASH_PATTERN_COUNT; i++) {
		const whitePixelBlob = canvasBlob([1, 1], (ctx) => {
			ctx.fillStyle = DefaultColorThemePalette.lightMode.black.semi
			ctx.fillRect(0, 0, 1, 1)
		})
		const blackPixelBlob = canvasBlob([1, 1], (ctx) => {
			ctx.fillStyle = DefaultColorThemePalette.darkMode.black.semi
			ctx.fillRect(0, 0, 1, 1)
		})
		defaultPatterns.push({
			zoom: i,
			url: whitePixelBlob,
			darkMode: false,
		})
		defaultPatterns.push({
			zoom: i,
			url: blackPixelBlob,
			darkMode: true,
		})
	}
	return defaultPatterns
}

function usePattern() {
	const editor = useEditor()
	const dpr = editor.getInstanceState().devicePixelRatio
	const [isReady, setIsReady] = useState(false)
	const defaultPatterns = useMemo(() => getDefaultPatterns(), [])
	const [backgroundUrls, setBackgroundUrls] = useState<PatternDef[]>(defaultPatterns)

	useEffect(() => {
		if (process.env.NODE_ENV === 'test') {
			setIsReady(true)
			return
		}

		const promises: Promise<{ zoom: number; url: string; darkMode: boolean }>[] = []

		for (let i = 1; i <= HASH_PATTERN_COUNT; i++) {
			promises.push(
				generateImage(dpr, i, false).then((blob) => ({
					zoom: i,
					url: URL.createObjectURL(blob),
					darkMode: false,
				}))
			)
			promises.push(
				generateImage(dpr, i, true).then((blob) => ({
					zoom: i,
					url: URL.createObjectURL(blob),
					darkMode: true,
				}))
			)
		}

		let isCancelled = false
		Promise.all(promises).then((urls) => {
			if (isCancelled) return
			setBackgroundUrls(urls)
			setIsReady(true)
		})

		return () => {
			isCancelled = true
			setIsReady(false)
		}
	}, [dpr])

	const defs = (
		<>
			{backgroundUrls.map((item) => {
				const key = item.zoom + (item.darkMode ? '_dark' : '_light')
				return (
					<pattern
						key={key}
						id={HASH_PATTERN_ZOOM_NAMES[key]}
						width={TILE_PATTERN_SIZE}
						height={TILE_PATTERN_SIZE}
						patternUnits="userSpaceOnUse"
					>
						<image href={item.url} width={TILE_PATTERN_SIZE} height={TILE_PATTERN_SIZE} />
					</pattern>
				)
			})}
		</>
	)

	return { defs, isReady }
}

function PatternFillDefForCanvas() {
	const editor = useEditor()
	const containerRef = useRef<SVGGElement>(null)
	const { defs, isReady } = usePattern()

	useEffect(() => {
		if (isReady && editor.environment.isSafari) {
			const htmlLayer = findHtmlLayerParent(containerRef.current!)
			if (htmlLayer) {
				// Wait for `patternContext` to be picked up
				requestAnimationFrame(() => {
					htmlLayer.style.display = 'none'

					// Wait for 'display = "none"' to take effect
					requestAnimationFrame(() => {
						htmlLayer.style.display = ''
					})
				})
			}
		}
	}, [editor, isReady])

	return (
		<g ref={containerRef} data-testid={isReady ? 'ready-pattern-fill-defs' : undefined}>
			{defs}
		</g>
	)
}

function findHtmlLayerParent(element: Element): HTMLElement | null {
	if (element.classList.contains('tl-html-layer')) return element as HTMLElement
	if (element.parentElement) return findHtmlLayerParent(element.parentElement)
	return null
}
