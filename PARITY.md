# Legacy-library parity plan

How RSC-GL's composable API (`<Chart>` + spec children) is brought to feature
parity with the legacy library it replaces (main package 1.53.1, plus the
next-generation package 0.11.1). It comes from a prop-by-prop audit that traced
every prop from the React component into the engine.

Status: every row below is implemented and covered by tests, except the items
marked **deferred** (each with its reason). The migration guide in the docs has a
live demo written only with the legacy component API.

## Principles

- **Same input, same chart.** A legacy chart, once codemodded, should draw the
  same marks with the same defaults. Where RSC-GL's old defaults differ, the
  composable API now uses the legacy default. The props-driven API
  (`BarChart`, `LineChart` and the others) keeps its own defaults.
- **Engine first.** Features go into `@rsc-gl/core` options so the props API,
  workers and SSR get them too. The React layer only translates props.
- **No silent drops.** A legacy prop is supported, has a documented
  replacement, or is listed as deferred here.

## 1. Series identity and mark scoping (engine + React)

| Item                                                                                                                                                     | Plan                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Grouped series ids are prefixed (`bar0:Chrome`), so `hiddenSeries`, `highlightedSeries`, legend toggles in trellis panels and `LinePointAnnotation` miss | Grouped series use the plain facet value as their id, as in the legacy library. A prefix is added only when two marks would produce the same id. |
| `onClick` / `onContextMenu` of every mark fire for a click on any mark                                                                                   | The engine reports `markIndex` (the index of the series options) with every item event. React calls only the clicked mark's handlers.            |
| One `ChartTooltip` / `ChartPopover` serves every mark                                                                                                    | Tooltip, popover and action bar are looked up per mark. A mark without a `ChartTooltip` shows none (new `disableTooltip` series option).         |
| `excludeDataKeys` leaves an empty tooltip box and still highlights                                                                                       | The engine hides the tooltip when the renderer returns nothing. Rows with an excluded key are not highlighted.                                   |
| No pointer cursor over clickable marks                                                                                                                   | New series option `cursor`. React sets it for marks with `onClick` or a popover.                                                                 |
| `onMouseOver` / `onMouseOut` on Bar, Line and Scatter                                                                                                    | New engine callback `onItemHover(item \| null)` carrying the datum and `markIndex`.                                                              |
| `idKey`                                                                                                                                                  | New chart option `idKey`, used for item keys and for the legacy `highlightedItem` value form.                                                    |
| `highlightedItem` legacy form (an id value or an array of values)                                                                                        | Accepted: values resolve through `idKey` (the first value when an array is given).                                                               |

## 2. Legend

| Item                                                                                                                 | Plan                                                                             |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `onClick` only fires when `isToggleable`                                                                             | Clicks fire whenever `onClick` is set. Toggling stays opt-in.                    |
| `onMouseOver` / `onMouseOut`                                                                                         | New `onLegendHover(id \| null)` engine callback.                                 |
| `defaultHiddenSeries`                                                                                                | Mapped to the engine option.                                                     |
| `legendLabels[].maxLength`, `labelLimit`, `titleLimit`                                                               | Truncated with an ellipsis; the full text stays in the title attribute.          |
| `descriptions[].title`                                                                                               | Included in the description text.                                                |
| `role="listitem"` on buttons (accessibility bug)                                                                     | A clickable legend is a `group` of real buttons; a static legend stays a `list`. |
| `keys`, legend facets (`color`, `lineType`, `opacity`, `symbolShape`), `_labelWrap`, `_preferredColumns`, `_maxRows` | **Deferred.** Rare; facet-driven legends need legend-specific scales.            |

## 3. Chart-level

| Item                                                                                                    | Plan                                                                                                           |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `height` default 400 (legacy 300)                                                                       | 300.                                                                                                           |
| `padding` object `{top, right, bottom, left}`                                                           | Accepted.                                                                                                      |
| Legacy palettes (`categorical6/12/16`, `s2Categorical*`, `divergent*`, `sequential*`) and colour tokens | Exact legacy values; no silent fallback to the default palette.                                                |
| `backgroundColor` tokens                                                                                | Resolved like any other colour.                                                                                |
| `locale` as a legacy `{ number, time }` object, or a Vega locale object, crashes the formatter          | Accepted; never throws.                                                                                        |
| `onVegaViewReady`                                                                                       | Replaced by `onReady(chart)`. The codemod rewrites it and leaves a note.                                       |
| `animations={false}` leaves the hover fade on                                                           | It turns off every animation, including the fade.                                                              |
| Title `position` default `start` (legacy `middle`), `fontWeight`                                        | Legacy default, plus `fontWeight`.                                                                             |
| `EmptyState` export                                                                                     | Exported as a standalone component.                                                                            |
| `ChartInspect` (next-gen name for `ChartTooltip`)                                                       | Exported alias.                                                                                                |
| `symbolShapes`, `symbolSizes`, `lineWidths`, `opacities` chart scales                                   | **Deferred.** Only used with key facets that are themselves deferred (section 6).                              |
| `config`, `theme` (Vega config), `renderer`, `s2`, `debug`, `UNSAFE_vegaSpec`                           | **Deferred by design.** These are renderer-specific. The engine `theme` option is the replacement for styling. |

## 4. Axis

| Item                                                                 | Plan                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `baseline` (legacy default off)                                      | The axis line is drawn only with `baseline`.                                 |
| `numberFormat` default `shortNumber`                                 | Legacy default.                                                              |
| `labels` (explicit ticks with `label`, `align`, `fontWeight`)        | Mapped to `tickValues` plus per-tick overrides.                              |
| `subLabels`                                                          | A second label line under matching ticks.                                    |
| `labelAlign`, `labelFontWeight`                                      | Supported.                                                                   |
| `tickCountLimit` (an upper limit), `tickCountMinimum`, `tickMinStep` | Supported on numeric axes.                                                   |
| `currencyCode`, `currencyLocale`                                     | Used by the `currency` and `shortCurrency` formats.                          |
| `title` as `string[]`                                                | Drawn on several lines.                                                      |
| `truncateLabels`                                                     | Truncates to the band width, not a fixed 180 px.                             |
| `labelOrientation="vertical"` on y axes                              | Supported.                                                                   |
| `granularity`                                                        | Also sets the time tick interval.                                            |
| `hasTooltip` (full label on hover), axis `onClick` (next-gen)        | Label hit-testing in the engine, with `onAxisLabelClick` and label tooltips. |
| `baselineOffset`, `hasPopover`, axis `ChartTooltip` child            | **Deferred.** Rare.                                                          |

## 5. Popover and selection

| Item                                                                                             | Plan                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `width` default 250, `minWidth`, `maxWidth`, `height`, `minHeight`, `maxHeight`, `contentMargin` | Supported.                                                                |
| `containerPadding` and viewport clamping                                                         | The popover is kept inside the chart's container.                         |
| Anchored at the pointer                                                                          | Anchored at the mark, as in the legacy library.                           |
| Opened from the keyboard at (0, 0)                                                               | Anchored at the focused mark.                                             |
| Selected mark not highlighted while open; `UNSAFE_highlightBy`                                   | Item (or series / dimension) highlight is held while the popover is open. |
| `onOpenChange(true)` not called on right-click                                                   | Called.                                                                   |

## 6. Marks

| Item                                                                                                                                                    | Plan                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Default colour: the legacy library draws Bar, Line and Scatter in one static colour unless `color` is set; RSC-GL grouped by `series`                   | Legacy default. Docs demos that relied on the old default now set `color="series"`.          |
| `metricAxis` (Bar, Line)                                                                                                                                | Binds the mark to a named axis.                                                              |
| `dualMetricAxis` (Bar, Line)                                                                                                                            | The last series moves to a secondary axis on the right.                                      |
| Bar `groupedPadding`, `paddingOuter`, `dimensionDataType`, `order`                                                                                      | Supported.                                                                                   |
| Bar `lineWidth`                                                                                                                                         | Draws a border in the fill colour.                                                           |
| Bar `Annotation` child (`textKey`, badge)                                                                                                               | `Annotation` component: a value badge on each bar.                                           |
| `BarDirectLabel` (next-gen)                                                                                                                             | Position (`start`, `middle`, `end`, `end-outside`), `dataKey`, `format`, `overflow`.         |
| Line `staticPoint` as a data key                                                                                                                        | Draws points on the rows where the key is truthy.                                            |
| Line `pointSize` (legacy: Vega area)                                                                                                                    | Converted to a diameter.                                                                     |
| Line `isSparkline` / `isMethodLast`                                                                                                                     | Sparkline mode with a point on the last value.                                               |
| Line `alternateSegmentLineType` (next-gen)                                                                                                              | Mapped.                                                                                      |
| `LineDirectLabel` (next-gen)                                                                                                                            | Exposed (`value`: last / average / series; `position`; `format`; `prefix`; `excludeSeries`). |
| `LineForecast` (next-gen)                                                                                                                               | A forecast metric drawn dashed after `start`, with a boundary rule and label.                |
| Area `name`                                                                                                                                             | Supported.                                                                                   |
| Scatter default opacity 1, size range XS–XL (6–16 px), `stroke`, `name`                                                                                 | Legacy defaults.                                                                             |
| ScatterAnnotation `textKey` default, `anchor` (string or list)                                                                                          | Supported (the first anchor that fits).                                                      |
| ScatterPath `groupBy` list, colour default `gray-500`, opacity 0.5                                                                                      | Supported.                                                                                   |
| LinePointAnnotation `textKey` mode (labels every static point)                                                                                          | Supported.                                                                                   |
| Trendline applies to every series                                                                                                                       | Scoped to its parent mark.                                                                   |
| Trendline `displayOnHover`, `excludeDataKeys`, `hidePartialWindows`, defaults (width 2, opacity 1)                                                      | Supported.                                                                                   |
| `TrendlineAnnotation` (`badge`, `numberFormat`, `prefix`)                                                                                               | Supported (the label sits at the line's end).                                                |
| MetricRange `scaleAxisToFit` (default off), `lineWidth`                                                                                                 | Supported.                                                                                   |
| DonutSummary `hideValue` also hid the label                                                                                                             | Fixed.                                                                                       |
| SegmentLabel: label plus value / percent, `labelKey`, `percentFormat`; `isBoolean` suppresses segment labels                                            | Supported.                                                                                   |
| BigNumber `numberType: 'percentage'`                                                                                                                    | Supported.                                                                                   |
| Bullet `thresholdMin`, `scaleType` (`normal`, `fixed`, `flexible`), `showTarget`, `showTargetValue`                                                     | Supported.                                                                                   |
| Venn with more than three sets throws; `label` default                                                                                                  | Fixed; default `label`.                                                                      |
| Opacity / lineType / size facets by key, DualFacet (dodged plus stacked), Bar `lineType` border dash                                                    | **Deferred.** They need per-item dash and opacity scales in the GPU marks.                   |
| Line `interactionMode`, `contextMenuMode`, `padding`; Area `order` / `padding`; Scatter `blend`, `clip`, `dimensionScaleType`                           | **Deferred.** Rare.                                                                          |
| Next-gen `showHoverLabel`, `dimensionHover`, `primarySeries`, Donut `emphasizedItems`, DonutSummary `delta`, Bar `diverging`, ReferenceLine `secondary` | **Deferred.** The next-gen package is pre-1.0 and these are still changing.                  |

## 7. Reference lines

`labelColor`, `labelFontWeight`, `position` (`before`, `after` or `center`
of the band), and `labelPosition="axis"` (the label outside the plot) are all
supported. `icon` is **deferred** (icon assets are renderer-specific).

## 8. Codemod

- Rename `ChartInspect` to `ChartTooltip`.
- Rewrite `onVegaViewReady` to `onReady` with a note.
- Strip renderer props only from chart tags, not from every JSX element.
- Fix the `UNSAFE_highlightBy` hint.
- Map the `Annotation`, `EmptyState` and `TrendlineAnnotation` imports.

## Out of scope

The next-gen `ai-catalog` (schema-driven chart requests), the docs MCP server,
the message-catalog framework (strings are English in both libraries today),
and the experimental hierarchical `accessibleNavigation`. RSC-GL's flat
keyboard navigation already covers every chart type.
