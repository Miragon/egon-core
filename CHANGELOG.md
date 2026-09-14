# Changelog

## [0.2.0](https://github.com/Miragon/egon-core/compare/v0.1.0...v0.2.0) (2026-09-14)


### ⚠ BREAKING CHANGES

* replaces the public picker events and preview/confirm/cancel methods with a provider contract that owns cancellation, cleanup, and stale-result protection. Bundles react-colorful against diagram-js's shared Preact runtime without consumer React dependencies or aliases, includes license notices, and updates migration documentation, SYNC.md, and [ADR 0035](docs/adr/0035-bundled-color-picker-and-provider-contract.md). Validation passed: typecheck, lint, formatting, 892 unit tests including architecture checks, 177 browser tests, and all 8 isolated-package journeys after rebasing onto main, including the package build and consumer checks.

### 🎉 New Features

* add default color picker and host provider override ([#153](https://github.com/Miragon/egon-core/issues/153)) ([38973d7](https://github.com/Miragon/egon-core/commit/38973d7fa6579eb5f43a00e50a81401f4158249a))


### 🐞 Bug Fixes

* default color picker and host provider override ([#156](https://github.com/Miragon/egon-core/issues/156)) ([aef15d1](https://github.com/Miragon/egon-core/commit/aef15d1d255d7cb683d9fc78e34c8c5fdaee5465))
* **deps:** update undici to 8.10.2 ([#154](https://github.com/Miragon/egon-core/issues/154)) ([f1ebf3b](https://github.com/Miragon/egon-core/commit/f1ebf3b0bff0a7c9375725709622666529d22310))


### 🛠️ Misc

* **deps:** bump js-yaml from 4.3.0 to 4.3.2 ([#142](https://github.com/Miragon/egon-core/issues/142)) ([b7e8e15](https://github.com/Miragon/egon-core/commit/b7e8e15ac191a0b473d56b4f9e860a0d988e9dbc))
* **deps:** bump postcss from 8.5.20 to 8.5.28 ([#100](https://github.com/Miragon/egon-core/issues/100)) ([2a5732f](https://github.com/Miragon/egon-core/commit/2a5732fff19169875e65a081d71239942791c43d))
* **deps:** bump tar from 7.5.20 to 7.5.22 ([#93](https://github.com/Miragon/egon-core/issues/93)) ([e07c7d0](https://github.com/Miragon/egon-core/commit/e07c7d06ae124839079fbbca67050deddbb93fc3))
* **deps:** bump the github-actions-all group across 1 directory with 5 updates ([#130](https://github.com/Miragon/egon-core/issues/130)) ([25c050f](https://github.com/Miragon/egon-core/commit/25c050f79a3818138419678db14866cb9883051a))

## 0.1.0 (2026-09-13)

### 🎉 New Features

- add demo harness and Playwright user journeys ([#110](https://github.com/Miragon/egon-core/issues/110)) ([2aa9793](https://github.com/Miragon/egon-core/commit/2aa97938decec51af06ee5b4d63bd2318cefdb6b))
- adopt @bpmn-io/align-to-origin, expose alignToOrigin and fitToScreen ([#40](https://github.com/Miragon/egon-core/issues/40)) ([3e6dfd7](https://github.com/Miragon/egon-core/commit/3e6dfd7b94adb981d25d7fe57b5c78940c3cf13a))
- bootstrap the repo to build, test, lint & typecheck standalone ([#17](https://github.com/Miragon/egon-core/issues/17)) ([7f39e6d](https://github.com/Miragon/egon-core/commit/7f39e6d724944b7372f3841b04057319eff71ad6)), closes [#1](https://github.com/Miragon/egon-core/issues/1)
- expose remaining host capabilities through EgonClient ([#149](https://github.com/Miragon/egon-core/issues/149)) ([8fb46f3](https://github.com/Miragon/egon-core/commit/8fb46f3e659c5804fdd7effb236a249d5b7b42f9))
- modeling command integration suite (browser tier) + four bug fixes ([#64](https://github.com/Miragon/egon-core/issues/64)) ([c86c94e](https://github.com/Miragon/egon-core/commit/c86c94e80c52d7b887a624b60412d0b874aa2b9e))
- re-enable color change with multi-select support ([#49](https://github.com/Miragon/egon-core/issues/49)) ([c178baa](https://github.com/Miragon/egon-core/commit/c178baa4350e34d3f63f71262614ded31d6e8e02))
- support EGN v4.0.0 file format and fix legacy v1.x import ([#21](https://github.com/Miragon/egon-core/issues/21)) ([f7a6a43](https://github.com/Miragon/egon-core/commit/f7a6a437f92ba9f8e40758d91fabf4c65c16462b))

### 🐞 Bug Fixes

- cancel debounced timers and remove the icon style node on destroy ([#80](https://github.com/Miragon/egon-core/issues/80)) ([5601a7a](https://github.com/Miragon/egon-core/commit/5601a7adffe8ed37b2a66f32f3d79566ed38c9d8))
- complete Unicode SVG encoding regression coverage ([#144](https://github.com/Miragon/egon-core/issues/144)) ([51c81f2](https://github.com/Miragon/egon-core/commit/51c81f206c90b33cf6272a6b8260ae620e841edb))
- correct color conversion, SVG sanitization, and replacement filtering ([#106](https://github.com/Miragon/egon-core/issues/106)) ([4b4d431](https://github.com/Miragon/egon-core/commit/4b4d431421b1ed6c8493a16e217ab141878c971d))
- correct latent labeling, color undo, and public API defects ([#105](https://github.com/Miragon/egon-core/issues/105)) ([7b95dd6](https://github.com/Miragon/egon-core/commit/7b95dd68b2c7dfdfaa2303ffde98c0cbe5fd9cf7))
- correct wrong dependency-internal assumptions and port bugs from the offline refactor ([#82](https://github.com/Miragon/egon-core/issues/82)) ([e3ce86b](https://github.com/Miragon/egon-core/commit/e3ce86b6d5343b5cfbd684f1f0f27d7828cafffe))
- cover browser rendering and editor interactions ([#109](https://github.com/Miragon/egon-core/issues/109)) ([29b3704](https://github.com/Miragon/egon-core/commit/29b3704dfbc84e57cbae1df8d439ee923f1934a5))
- declare missing **depends** and finish textRenderer config injection ([#92](https://github.com/Miragon/egon-core/issues/92)) ([1ef5aca](https://github.com/Miragon/egon-core/commit/1ef5acaafd040f93dcb8ce852c217a9a1c4b7764))
- deny an annotation as a connection source in canConnect ([#78](https://github.com/Miragon/egon-core/issues/78)) ([84c131e](https://github.com/Miragon/egon-core/commit/84c131e7a749cc05fc7a4744102eeaf9f4b89e3a))
- deny forbidden activity↔annotation reconnect at both endpoints ([#73](https://github.com/Miragon/egon-core/issues/73)) ([55df24b](https://github.com/Miragon/egon-core/commit/55df24bf9ee1c84f4781146195e6c9ee95b20836))
- hide context-pad delete on rule denial and clear stale color-picker selection ([#95](https://github.com/Miragon/egon-core/issues/95)) ([34525f8](https://github.com/Miragon/egon-core/commit/34525f8944ee4bd205de01c91b1870116b7ac349))
- icon names with dots break CSS classes and import/export round-trip ([#22](https://github.com/Miragon/egon-core/issues/22)) ([921d134](https://github.com/Miragon/egon-core/commit/921d134999026022ecc8f394649f5cbee56ca941))
- make group adoption consistent with persistence and undo ([#135](https://github.com/Miragon/egon-core/issues/135)) ([7d728a7](https://github.com/Miragon/egon-core/commit/7d728a7aea0a6c5a15343e0772a0f32e3b2f170c))
- make the activity number edit one atomic command ([#77](https://github.com/Miragon/egon-core/issues/77)) ([a644129](https://github.com/Miragon/egon-core/commit/a644129537ada3db5cedc126bc36fee6488dc4bc))
- persist reversed activity waypoints ([#134](https://github.com/Miragon/egon-core/issues/134)) ([7c16fe9](https://github.com/Miragon/egon-core/commit/7c16fe9a8c40586e2fc3618b4550c62b1b58bb94))
- port upstream autocomplete rewrite and revive keyboard navigation ([#24](https://github.com/Miragon/egon-core/issues/24)) ([ce3164d](https://github.com/Miragon/egon-core/commit/ce3164d292991937a90bce5b3b7f0cb2231e1638))
- preserve editor state when document import fails ([#136](https://github.com/Miragon/egon-core/issues/136)) ([f253d4f](https://github.com/Miragon/egon-core/commit/f253d4ff2fc83b6167cce89b5d35a0f9fb1343fc))
- preserve group membership across open-save round trips ([#107](https://github.com/Miragon/egon-core/issues/107)) ([07ff1af](https://github.com/Miragon/egon-core/commit/07ff1af4aee389dcf84f5f2b1d6b176fc4beaed0))
- preserve icon names during legacy whitespace repair ([#143](https://github.com/Miragon/egon-core/issues/143)) ([3c022d6](https://github.com/Miragon/egon-core/commit/3c022d666e07fbc59de094ae17bc972728f81f1a))
- prevent script execution through imported SVG icons ([#132](https://github.com/Miragon/egon-core/issues/132)) ([a760833](https://github.com/Miragon/egon-core/commit/a760833ad51ab6f393068cd1bc48362ccec08fed))
- refresh imported icons and deduplicate event subscriptions ([#104](https://github.com/Miragon/egon-core/issues/104)) ([68b3337](https://github.com/Miragon/egon-core/commit/68b333730ee2bc43b51cedc06a579d207cf03d37))
- refresh shared icon artwork on add and re-add ([#139](https://github.com/Miragon/egon-core/issues/139)) ([c46e02a](https://github.com/Miragon/egon-core/commit/c46e02ac8bea46488a240018c8ee2ef9cbd57068))
- remove-group-without-children as one modeling transaction ([#76](https://github.com/Miragon/egon-core/issues/76)) ([2cc5efb](https://github.com/Miragon/egon-core/commit/2cc5efb820ed739e84487d112e22d616303156dd))
- render autocomplete labels as text ([#131](https://github.com/Miragon/egon-core/issues/131)) ([fc74a40](https://github.com/Miragon/egon-core/commit/fc74a408d707d3e88377b2d84d13ae4ee41c1ecc))
- renderer must not write to the model (waypoint drift + default colour) ([#75](https://github.com/Miragon/egon-core/issues/75)) ([ea19a46](https://github.com/Miragon/egon-core/commit/ea19a4611c2043a548e820ad62a76bc250bafcf6))
- replace deprecated ContextPad.getPad() in replace-menu positioning ([#25](https://github.com/Miragon/egon-core/issues/25)) ([ad2c51c](https://github.com/Miragon/egon-core/commit/ad2c51ce2f6fb8b0b4069aebdae989246304b148))
- restore pickedColor and text-annotation content on copy-paste ([#39](https://github.com/Miragon/egon-core/issues/39)) ([6cd02f5](https://github.com/Miragon/egon-core/commit/6cd02f5d31374335dd7486faeeb59399e1dedabd))
- retain referenced icon assets when exporting stories ([#133](https://github.com/Miragon/egon-core/issues/133)) ([fabd4da](https://github.com/Miragon/egon-core/commit/fabd4dab55386170b18f68043d42a18536f88725))
- scope color-picker requests to their originating client ([#141](https://github.com/Miragon/egon-core/issues/141)) ([357e309](https://github.com/Miragon/egon-core/commit/357e30986a826b6737d7e5393b668881ac12b8d1))
- scope generated icon CSS to each editor session ([#140](https://github.com/Miragon/egon-core/issues/140)) ([fd75259](https://github.com/Miragon/egon-core/commit/fd752593eb5961ae9667de20d181a20fab78602d))
- scope popup and version banner to each canvas ([#103](https://github.com/Miragon/egon-core/issues/103)) ([571c013](https://github.com/Miragon/egon-core/commit/571c0130e4f7e430628a0d46b915bc54b713d8c4))
- separate work-object palette entries from actors ([#101](https://github.com/Miragon/egon-core/issues/101)) ([dd26d74](https://github.com/Miragon/egon-core/commit/dd26d746ab86a6439830a2cec802a5a6d7e5b40a))
- ship editor styles and validate package archives ([#146](https://github.com/Miragon/egon-core/issues/146)) ([9c95b65](https://github.com/Miragon/egon-core/commit/9c95b650b27c8d7d440b2eb6af95e8db59983f3a))
- stop sanitizing labels at edit time ([#37](https://github.com/Miragon/egon-core/issues/37)) ([ed77fc9](https://github.com/Miragon/egon-core/commit/ed77fc95454764eaa50bc884d811992b2324aa47))
- terminate ID allocation after four-digit suffix collisions ([#145](https://github.com/Miragon/egon-core/issues/145)) ([c48337d](https://github.com/Miragon/egon-core/commit/c48337d7770b87b2f9418f94dbba64832fa121bf))
- update annotation bracket preview on resize, port getAnnotationBracketSvg ([#38](https://github.com/Miragon/egon-core/issues/38)) ([6a91d68](https://github.com/Miragon/egon-core/commit/6a91d68e483e2b4b1773216861b49a9e2e5a6869))

### 🔨 Refactoring

- carve out shared/ and labelDictionary/, drop dead entity duplicate ([#32](https://github.com/Miragon/egon-core/issues/32)) ([ca4bf07](https://github.com/Miragon/egon-core/commit/ca4bf07d97418fe0f2baf71a92a0b57a321cf8e6))
- consolidate getTypeIconSRC into getIconSource ([#48](https://github.com/Miragon/egon-core/issues/48)) ([faf51f2](https://github.com/Miragon/egon-core/commit/faf51f287f87f49cde811d37a55fd215f31f64dc))
- consolidate story domain and import/export services into story/ ([#34](https://github.com/Miragon/egon-core/issues/34)) ([c026267](https://github.com/Miragon/egon-core/commit/c0262677057c6449cb88880e64ad0acddd6ff80a))
- eliminate module-level singletons for multi-instance safety ([#42](https://github.com/Miragon/egon-core/issues/42)) ([2ed7fcf](https://github.com/Miragon/egon-core/commit/2ed7fcfab51c958eaf0fa3d8474de3f6a617e68b))
- extract deferred notation policies into domain ([#152](https://github.com/Miragon/egon-core/issues/152)) ([4900acd](https://github.com/Miragon/egon-core/commit/4900acdc65d320712fbc8ee75da03e1f0fea87f5))
- freeze public API to EgonClient, enforce target invariants ([#30](https://github.com/Miragon/egon-core/issues/30)) ([#36](https://github.com/Miragon/egon-core/issues/36)) ([dda10bd](https://github.com/Miragon/egon-core/commit/dda10bdcbf7501604b4fa9cfebb2e0ea65f9868d))
- make Dictionary generic, add find/toRecord/fromRecord, get() throws ([#47](https://github.com/Miragon/egon-core/issues/47)) ([8a9f248](https://github.com/Miragon/egon-core/commit/8a9f248fbc29e3455062c01acf4245dede1a0085))
- move activity numbering math into domain ([#62](https://github.com/Miragon/egon-core/issues/62)) ([4f7a0be](https://github.com/Miragon/egon-core/commit/4f7a0be3e9db560f0bbacbb842cbd00a26492a6c))
- move client hexagon and diagram-js features into modeler/ ([#35](https://github.com/Miragon/egon-core/issues/35)) ([0ecdccf](https://github.com/Miragon/egon-core/commit/0ecdccfe22e9f58bd31a62ce7f841cae561161c1))
- move connection & element-type rules into domain ([#61](https://github.com/Miragon/egon-core/issues/61)) ([7b8ea5b](https://github.com/Miragon/egon-core/commit/7b8ea5bfeffea696fa8ec950740b9789dd395f7a))
- move icon services to iconSet/ and split CSS injection into infra ([#33](https://github.com/Miragon/egon-core/issues/33)) ([9691442](https://github.com/Miragon/egon-core/commit/9691442a5dc2e8d7c4a0db2be191c60b27184fe9))
- move label geometry to domain and freeze predicate imports ([#108](https://github.com/Miragon/egon-core/issues/108)) ([ada6afc](https://github.com/Miragon/egon-core/commit/ada6afc05c88d902d5b1f297bbd0146ab8f07793))
- remove numbering-registry dead code, port upstream low-prio cleanups ([#43](https://github.com/Miragon/egon-core/issues/43)) ([669dd5e](https://github.com/Miragon/egon-core/commit/669dd5e6aa3ec66fb3627d7522e8c57156b48c00))
- remove the renderer's remaining writes to the model ([#81](https://github.com/Miragon/egon-core/issues/81)) ([de0a85d](https://github.com/Miragon/egon-core/commit/de0a85dd20b8d5322e45b780f5b475df846c9c70))
- type the grammar↔adapter rule-verdict seam ([#79](https://github.com/Miragon/egon-core/issues/79)) ([729b8d8](https://github.com/Miragon/egon-core/commit/729b8d87c92b3cdca83f481b3063b8be0cbfd265))

### 📔 Documentation

- add ADR 0007 — adopt EGN v4.0.0 as the canonical file format ([#23](https://github.com/Miragon/egon-core/issues/23)) ([df726a7](https://github.com/Miragon/egon-core/commit/df726a7613027a14f07822e6d7d88dfb48d0600c))
- add CLAUDE.md with repo conventions and architecture rules ([#31](https://github.com/Miragon/egon-core/issues/31)) ([df86dc2](https://github.com/Miragon/egon-core/commit/df86dc2cd2045f088b19bfcb09c7e1c28cc056f8))
- add SYNC.md with upstream sync baseline, mapping, and process ([#50](https://github.com/Miragon/egon-core/issues/50)) ([c1a4d4a](https://github.com/Miragon/egon-core/commit/c1a4d4a34b6ba56838a4dc70d05030e491a35b6a))
- update pr template ([#58](https://github.com/Miragon/egon-core/issues/58)) ([779defa](https://github.com/Miragon/egon-core/commit/779defa1e4cf7e16ffe8eb0dfdee83465dd455fa))

### 🛠️ Misc

- add audit job, coverage PR report, and ci rollup gate ([#20](https://github.com/Miragon/egon-core/issues/20)) ([366dd16](https://github.com/Miragon/egon-core/commit/366dd16afd08ceec8fc00b4daee505775602c10f))
- adopt Release Please and GitHub package archives ([#148](https://github.com/Miragon/egon-core/issues/148)) ([38406a2](https://github.com/Miragon/egon-core/commit/38406a24797da8178ecbe21f8580b15be13955ce))
- remove dead auto-place, rule, and event seams ([#94](https://github.com/Miragon/egon-core/issues/94)) ([b3f231c](https://github.com/Miragon/egon-core/commit/b3f231cfe744a47cdc1dc77aa029d1124856ca79))
- update agents setup ([#137](https://github.com/Miragon/egon-core/issues/137)) ([8a11ec4](https://github.com/Miragon/egon-core/commit/8a11ec49fa1748ae28f0697ef4b921710de12443))
- vitest projects (unit + browser) and shared test infrastructure ([#59](https://github.com/Miragon/egon-core/issues/59)) ([59cd3c8](https://github.com/Miragon/egon-core/commit/59cd3c876c773fca34fd5b7e04cb97dcba3beae7))
