import './style.css'
import contentHtml from './content.html?raw'
import OBR from "@owlbear-rodeo/sdk";

document.querySelector<HTMLDivElement>('#app')!.innerHTML = contentHtml

// Helper functions
let isScriptChange = false;
let isLoading = false;
let isReady = false;
const ID = "com.landofeem.sheet";
let localState: Record<string, any> = {};
let saveTimeout: number | undefined;
let draggedRowId: string | null = null;
let dragProxy: HTMLElement | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

const preventDefaultDragOver = (e: DragEvent) => {
	e.preventDefault();
	if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
};

const getAttrs = (attributes: string[], callback: (values: Record<string, string>) => void) => {
	const values: Record<string, string> = {};
	attributes.forEach(attr => {
		const elements = document.querySelectorAll(`[name="attr_${attr}"]`);
		if (elements.length > 0) {
			const first = elements[0] as HTMLInputElement;
			if (first.type === 'radio') {
				const checked = Array.from(elements).find(e => (e as HTMLInputElement).checked);
				values[attr] = checked ? (checked as HTMLInputElement).value : "";
			} else if (first.type === 'checkbox') {
				values[attr] = first.checked ? (first.value || "on") : "0";
			} else {
				values[attr] = first.value;
			}
		} else {
			values[attr] = "";
		}
	});
	callback(values);
};

const setAttrs = (attributes: Record<string, string | number>) => {
	isScriptChange = true;
	Object.entries(attributes).forEach(([key, value]) => {
		const elements = document.querySelectorAll(`[name="attr_${key}"]`);
		elements.forEach(el => {
			if (el.tagName === 'SPAN' || el.tagName === 'DIV') {
				el.textContent = String(value);
			} else {
				const inputEl = el as HTMLInputElement;
				if (inputEl) {
					if (inputEl.type === 'radio') {
						if (inputEl.value === String(value)) {
							inputEl.checked = true;
						} else {
							inputEl.checked = false;
						}
					} else if (inputEl.type === 'checkbox') {
						const valStr = String(value);
						if (valStr === (inputEl.value || "on") || valStr === "true" || valStr === "1") {
							inputEl.checked = true;
						} else {
							inputEl.checked = false;
						}
					} else {
						inputEl.value = String(value);
						inputEl.setAttribute('value', String(value));
					}
					inputEl.dispatchEvent(new Event('change', { bubbles: true }));
				}
			}
		});
	});
	isScriptChange = false;
};

const saveSheetData = (data: Record<string, any>) => {
	if (!isReady) return;

	// Update local state
	localState = { ...localState, ...data };

	// Debounce save
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = window.setTimeout(async () => {
		console.log("Saving to Room Metadata:", localState);
		try {
			const playerId = await OBR.player.getId();
			const key = `${ID}/player/${playerId}`;
			await OBR.room.setMetadata({ [key]: localState });
			console.log("Save completed successfully to:", key);
		} catch (error) {
			console.error("Error saving metadata:", error);
		}
	}, 500);
};

const loadSheetData = async () => {
	console.log("Loading sheet data...");
	isLoading = true;
	try {
		const playerId = await OBR.player.getId();
		console.log("Player ID:", playerId);
		const key = `${ID}/player/${playerId}`;
		const metadata = await OBR.room.getMetadata();
		console.log("Room Metadata loaded");
		localState = (metadata[key] as Record<string, any>) || {};
		console.log("Sheet data to set:", localState);

		// Initialize repeating sections from array if exists
		if (localState.repeating_skills && Array.isArray(localState.repeating_skills)) {
			reconstructRepeatingSections(localState.repeating_skills);
		} else {
			// Legacy support or empty
			reconstructRepeatingSections([]);
		}

		setAttrs(localState);
	} catch (error) {
		console.error("Error loading sheet data:", error);
	}
	isLoading = false;
	console.log("Sheet data loaded.");
};

// Global synchronization for all attributes
document.querySelectorAll<HTMLInputElement>('[name^="attr_"]').forEach(input => {
	input.addEventListener('change', (e) => {
		const target = e.target as HTMLInputElement;
		if (!isScriptChange) {
			// Update the target's attribute for CSS selectors
			if (target.type !== 'radio' && target.type !== 'checkbox') {
				target.setAttribute('value', target.value);
			}

			const allSameName = document.querySelectorAll(`[name="${target.name}"]`);
			allSameName.forEach(other => {
				if (other !== target) {
					const otherInput = other as HTMLInputElement;
					if (target.type === 'radio') {
						if (target.checked && otherInput.value === target.value) {
							otherInput.checked = true;
						}
					} else if (target.type === 'checkbox') {
						otherInput.checked = target.checked;
					} else {
						otherInput.value = target.value;
						otherInput.setAttribute('value', target.value);
					}
				}
			});
		}

		if (!isLoading) {
			const attrName = target.name.replace('attr_', '');
			let value = target.value;
			if (target.type === 'checkbox') {
				value = target.checked ? (target.value || "on") : "0";
			}
			saveSheetData({ [attrName]: value });
		}
	});
});

const on = (eventStr: string, callback: (eventInfo: any) => void) => {
	const events = eventStr.split(' ');
	events.forEach(event => {
		if (event.startsWith('change:')) {
			const attr = event.replace('change:', '');
			const elements = document.querySelectorAll(`[name="attr_${attr}"]`);
			elements.forEach(el => {
				el.addEventListener('change', (e) => {
					const target = e.target as HTMLInputElement;
					const eventInfo = {
						sourceAttribute: attr,
						sourceType: isScriptChange ? 'sheetworker' : 'player',
						previousValue: target.getAttribute('data-prev') || "",
						newValue: target.type === 'checkbox' ? (target.checked ? (target.value || "on") : "0") : target.value
					};
					target.setAttribute('data-prev', eventInfo.newValue);
					callback(eventInfo);
				});
			});
		} else if (event.startsWith('clicked:')) {
			const btnName = event.replace('clicked:', '');
			const elements = document.querySelectorAll(`[name="act_${btnName}"]`);
			elements.forEach(el => {
				el.addEventListener('click', () => {
					callback({ sourceType: 'player' });
				});
			});
		} else if (event === 'sheet:opened') {
			// Call immediately as the sheet is already loaded
			callback({ sourceType: 'sheetworker' });
		}
	});
};

const getTranslationByKey = (key: string) => key;

const generateRowID = () => "row" + Math.random().toString(36).substr(2, 9);

//********* REPEATING SECTIONS SUPPORT **********/
const updateInputNames = (element: HTMLElement, rowId: string) => {
	const inputs = element.querySelectorAll('[name^="attr_"]');
	inputs.forEach(el => {
		const input = el as HTMLInputElement;
		const name = input.getAttribute('name');
		if (name) {
			const newName = name.replace('attr_', `attr_repeating_skills_${rowId}_`);
			input.setAttribute('name', newName);
			// Also update class if it matches the name (sometimes used)
		}
	});
	// Also check the element itself if it's an input
	if (element.hasAttribute('name') && element.getAttribute('name')?.startsWith('attr_')) {
		const name = element.getAttribute('name')!;
		const newName = name.replace('attr_', `attr_repeating_skills_${rowId}_`);
		element.setAttribute('name', newName);
	}
};

const attachInputListeners = (element: HTMLElement) => {
	element.querySelectorAll<HTMLInputElement>('[name^="attr_"]').forEach(input => {
		// Auto-expand logic
		if (input.tagName === 'TEXTAREA' && input.parentElement?.classList.contains('sheet-auto-expand')) {
			input.addEventListener('input', () => {
				const span = input.parentElement?.querySelector('span');
				if (span) span.textContent = input.value;
			});
		}

		input.addEventListener('change', (e) => {
			const target = e.target as HTMLInputElement;

			// Handle skilledit checkbox specifically for CSS styling
			if (target.name.endsWith('_skilledit') && target.type === 'checkbox') {
				const hiddenInput = target.parentElement?.querySelector(`input[type="hidden"][name="${target.name}"]`) as HTMLInputElement;
				if (hiddenInput) {
					hiddenInput.value = target.checked ? "on" : "0";
					hiddenInput.setAttribute('value', target.checked ? "on" : "0");
				}
			}

			// Auto-expand logic on change
			if (target.tagName === 'TEXTAREA' && target.parentElement?.classList.contains('sheet-auto-expand')) {
				const span = target.parentElement?.querySelector('span');
				if (span) span.textContent = target.value;
			}

			if (!isScriptChange) {
				if (target.type !== 'radio' && target.type !== 'checkbox') {
					target.setAttribute('value', target.value);
				}
			}

			if (!isLoading) {
				const attrName = target.name.replace('attr_', '');
				let value = target.value;
				if (target.type === 'checkbox') {
					value = target.checked ? (target.value || "on") : "0";
				}

				// Check if this is a repeating section attribute
				if (attrName.startsWith('repeating_skills_')) {
					const parts = attrName.split('_');
					// repeating_skills_ROWID_field
					if (parts.length >= 4) {
						const rowId = parts[2];
						const field = parts.slice(3).join('_');

						// Update array in localState
						const skills = [...((localState.repeating_skills as any[]) || [])];
						const itemIndex = skills.findIndex((i: any) => i.id === rowId);

						if (itemIndex >= 0) {
							skills[itemIndex] = { ...skills[itemIndex], [field]: value };
							saveSheetData({ repeating_skills: skills });
						}
					}
				} else {
					saveSheetData({ [attrName]: value });
				}
			}
		});
	});
};

const deleteRepeatingRowData = (rowId: string) => {
	const skills = (localState.repeating_skills as any[]) || [];
	const newSkills = skills.filter((i: any) => i.id !== rowId);
	saveSheetData({ repeating_skills: newSkills });
};

const createRepeatingRow = (container: HTMLElement, fieldset: HTMLFieldSetElement, rowId: string, initialValues: any = null) => {
	// Check if row already exists
	if (container.querySelector(`[data-reprowid="${rowId}"]`)) return;

	const item = document.createElement('div');
	item.classList.add('repitem');
	item.setAttribute('data-reprowid', rowId);

	// Item Control (Delete/Move)
	const control = document.createElement('div');
	control.classList.add('itemcontrol');
	control.style.display = container.classList.contains('editmode') ? 'block' : 'none';
	control.innerHTML = `<button type="button" class="btn btn-danger pictos repcontrol_del">⨯</button><a class="btn repcontrol_move" draggable="true">≡</a>`;
	item.appendChild(control);

	// Clone all children of the fieldset
	Array.from(fieldset.children).forEach(child => {
		const clone = child.cloneNode(true) as HTMLElement;
		updateInputNames(clone, rowId);
		item.appendChild(clone);
	});

	// Set initial values if provided
	if (initialValues) {
		Object.entries(initialValues).forEach(([key, value]) => {
			if (key === 'id') return;
			const inputName = `attr_repeating_skills_${rowId}_${key}`;
			// Use querySelectorAll to handle multiple inputs with same name (e.g. hidden + checkbox)
			const inputs = item.querySelectorAll(`[name="${inputName}"]`);

			inputs.forEach(el => {
				const input = el as HTMLInputElement;
				if (input.type === 'checkbox') {
					const isChecked = value === 'on' || value === 'true' || value === '1';
					input.checked = isChecked;
					// Also set value attribute for CSS selectors if needed
					if (input.classList.contains('skilledit')) {
						// This is likely the hidden input if it has the class, but let's be safe
						input.value = isChecked ? "on" : "0";
						input.setAttribute('value', isChecked ? "on" : "0");
					}
				} else if (input.type === 'hidden') {
					// Handle hidden inputs specifically
					input.value = String(value);
					input.setAttribute('value', String(value));
				} else {
					input.value = String(value);
					input.setAttribute('value', String(value));
					// Trigger auto-expand for textareas
					if (input.tagName === 'TEXTAREA' && input.parentElement?.classList.contains('sheet-auto-expand')) {
						const span = input.parentElement?.querySelector('span');
						if (span) span.textContent = String(value);
					}
				}
			});
		});
	}

	// Add delete listener
	const delBtn = item.querySelector('.repcontrol_del');
	if (delBtn) {
		delBtn.addEventListener('click', () => {
			if (confirm('Are you sure you want to delete this item?')) {
				item.remove();
				deleteRepeatingRowData(rowId);
			}
		});
	}

	// Drag and Drop Listeners
	// Attach listeners to the handle instead of the item for dragstart
	const moveHandle = item.querySelector('.repcontrol_move') as HTMLElement;
	if (moveHandle) {
		document.addEventListener('dragenter', (e) => {
			e.dataTransfer!.effectAllowed = 'move';
			e.preventDefault();
		});
		document.addEventListener('dragleave', (e) => {
			e.dataTransfer!.effectAllowed = 'move';
			e.preventDefault();
		});
		moveHandle.addEventListener('dragstart', (e) => {
			console.log("Drag Start");
			draggedRowId = rowId;
			e.dataTransfer!.effectAllowed = 'move';
			e.dataTransfer!.setData('text/plain', rowId);

			// Calculate offset to position drag image exactly under cursor
			const rect = item.getBoundingClientRect();
			dragOffsetX = e.clientX - rect.left;
			dragOffsetY = e.clientY - rect.top;

			// Create a custom drag proxy
			const clone = item.cloneNode(true) as HTMLElement;
			clone.style.width = `${rect.width}px`;

			// Remove background from itemcontrol in clone
			const cloneControl = clone.querySelector('.itemcontrol') as HTMLElement;
			if (cloneControl) cloneControl.style.backgroundColor = 'transparent';

			// Create wrapper structure to preserve CSS context
			const containerDiv = document.createElement('div');
			containerDiv.classList.add('container');
			Object.assign(containerDiv.style, {
				position: 'fixed',
				pointerEvents: 'none',
				zIndex: '9999',
				top: `${e.clientY - dragOffsetY}px`,
				left: `${e.clientX - dragOffsetX}px`,
				backgroundColor: 'transparent',
				width: 'auto',
				height: 'auto',
				padding: '0',
				margin: '0'
			});

			const wrapper = document.createElement('div');
			wrapper.classList.add('eem');
			Object.assign(wrapper.style, {
				height: 'auto',
				display: 'block',
				padding: '0'
			});
			containerDiv.appendChild(wrapper);

			const noteBox = document.createElement('div');
			noteBox.classList.add('note-box');
			noteBox.style.margin = '0';
			wrapper.appendChild(noteBox);

			const repContainer = document.createElement('div');
			repContainer.classList.add('repcontainer');
			if (container.classList.contains('editmode')) {
				repContainer.classList.add('editmode');
			}
			Object.assign(repContainer.style, {
				height: 'auto',
				overflow: 'visible',
				backgroundImage: 'none'
			});
			noteBox.appendChild(repContainer);

			repContainer.appendChild(clone);

			dragProxy = containerDiv;
			document.body.appendChild(dragProxy);

			// Hide default browser drag image
			const empty = document.createElement('div');
			e.dataTransfer!.setDragImage(empty, 0, 0);

			// Hide original item
			setTimeout(() => item.classList.add('dragging'), 0);

			// Enforce cursor style globally
			document.addEventListener('dragover', preventDefaultDragOver, true);
			document.body.classList.add('is-dragging');

			e.stopPropagation();
		});

		moveHandle.addEventListener('drag', (e) => {
			if (dragProxy && e.clientX !== 0 && e.clientY !== 0) {
				dragProxy.style.top = `${e.clientY - dragOffsetY}px`;
			}
		});

		moveHandle.addEventListener('dragend', () => {
			document.removeEventListener('dragover', preventDefaultDragOver, true);
			document.body.classList.remove('is-dragging');

			draggedRowId = null;
			if (dragProxy) {
				dragProxy.remove();
				dragProxy = null;
			}
			item.classList.remove('dragging');
			document.querySelectorAll('.repitem').forEach(el => el.classList.remove('drag-over'));
		});
	}

	// Drop targets are still the items
	item.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'move';

		if (draggedRowId && draggedRowId !== rowId) {
			const draggedItem = container.querySelector(`[data-reprowid="${draggedRowId}"]`) as HTMLElement;
			if (draggedItem) {
				const rect = item.getBoundingClientRect();
				const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;

				if (next && item.nextElementSibling !== draggedItem) {
					item.after(draggedItem);
				} else if (!next && item.previousElementSibling !== draggedItem) {
					item.before(draggedItem);
				}
			}
		}
	});

	item.addEventListener('dragleave', () => {
		item.classList.remove('drag-over');
	});

	item.addEventListener('drop', (e) => {
		e.preventDefault();

		// Reorder Array based on current DOM order
		const newOrder = Array.from(container.querySelectorAll('.repitem'))
			.map(el => el.getAttribute('data-reprowid'));

		const skills = (localState.repeating_skills as any[]) || [];

		// Sort skills array based on newOrder
		const newSkills = newOrder.map(id => skills.find((s: any) => s.id === id)).filter(s => s);

		saveSheetData({ repeating_skills: newSkills });

		item.classList.remove('drag-over');
	});

	container.appendChild(item);

	// Attach change listeners to new inputs
	attachInputListeners(item);
};

const initRepeatingSections = () => {
	document.querySelectorAll('.repeating_skills_container').forEach(container => {
		const addBtn = container.querySelector('.repcontrol_add');
		const editBtn = container.querySelector('.repcontrol_edit');
		const repContainer = container.querySelector('.repcontainer');
		const fieldset = container.querySelector('fieldset.repeating_skills');

		if (addBtn && repContainer && fieldset) {
			addBtn.addEventListener('click', () => {
				const rowId = generateRowID();
				// Add to array
				const skills = (localState.repeating_skills as any[]) || [];
				skills.push({ id: rowId });
				saveSheetData({ repeating_skills: skills });

				createRepeatingRow(repContainer as HTMLElement, fieldset as HTMLFieldSetElement, rowId);
			});
		}

		if (editBtn && repContainer) {
			editBtn.addEventListener('click', () => {
				const isEdit = repContainer.classList.toggle('editmode');
				editBtn.textContent = isEdit ? 'Done' : 'Modify';
				if (addBtn) (addBtn as HTMLElement).style.display = isEdit ? 'none' : '';

				// Toggle item controls
				repContainer.querySelectorAll('.repitem').forEach(item => {
					const control = item.querySelector('.itemcontrol');
					if (control) (control as HTMLElement).style.display = isEdit ? 'block' : 'none';
				});
			});
		}
	});
};

const reconstructRepeatingSections = (data: any[]) => {
	const container = document.querySelector('.repeating_skills_container .repcontainer') as HTMLElement;
	const fieldset = document.querySelector('.repeating_skills_container fieldset.repeating_skills') as HTMLFieldSetElement;

	if (!container || !fieldset) return;

	// Clear existing to prevent duplicates on reload/re-render
	container.innerHTML = '';

	data.forEach(item => {
		if (item && item.id) {
			createRepeatingRow(container, fieldset, item.id, item);
		}
	});
};

//********* TAB BUTTONS **********/
const buttonlist = ["attributes", "inventory", "background", "notes", "settings"]
buttonlist.forEach(button => {
	on(`clicked:${button}`, function () {
		setAttrs({
			sheetTab: button
		})
	})
})

//********* DEFINE SIGNED AND UNSIGNED ATTRIBUTES **********/
const signed = ["attack", "defense", "vim", "charm", "inspire", "mettle", "perception", "vigor", "athletics", "intimidate", "might", "vitality", "knack", "nimbleness", "search", "sneak", "trickery", "knowhow", "lore", "realms", "tinker", "wilderness", "treasure_hunting"];
const unsigned = ["courage", "courage_max", "quest_pts", "block", "inventory_slots", "inventory_slots_max", "material_number", "coins_copper", "coins_silver", "coins_gold", "coins_ancient", "rations_d6", "rations_d8", "rations_d10", "lv", "xp"];

//********* DEFINE CUSTOM FUNCTIONS **********/
const updateStats = (statNames: string[], difference: number) => {
	const result: Record<string, string | number> = {}
	getAttrs(statNames.concat("clamp_modifiers"), (vals) => {
		statNames.forEach(stat => {
			let statVal = parseInt(vals[stat]) + difference
			const clamp = vals["clamp_modifiers"] === "true"
			if (clamp) statVal = (statVal >= 3 ? 3 : (statVal <= -3 ? -3 : statVal))
			result[stat] = statVal >= 0 ? "+" + statVal : statVal
			setAttrs({
				[stat]: result[stat]
			})
		})
	})
	return result
}

//********* VALIDATE SIGNED NUMBER VALUES ON CHANGE **********/
on(signed.map(field => "change:" + field).join(" "), (eventinfo) => {
	const fieldName = eventinfo.sourceAttribute
	getAttrs([fieldName, "clamp_modifiers"], (values) => {
		//********* IGNORE SHEETWORKER EVENTS **********/
		if (eventinfo.sourceType === "sheetworker") {
			return
		}
		const clamp = values["clamp_modifiers"] === "true"
		//********* CLAMP TO -3 +3 AND SET THE VALUE **********/
		let oldValue = parseInt(eventinfo.previousValue) || 0
		let val: string | number = parseInt(values[fieldName])
		if (isNaN(val)) {
			val = "+0"
		}
		else if (clamp && val < -3) {
			val = "-3"
		}
		else if (clamp && val > 3) {
			val = "+3"
		}
		else if (val >= 0) {
			val = "+" + val
		}
		setAttrs({
			[fieldName]: val
		})
		const difference = (parseInt(String(val)) - oldValue)
		//********* SYNC ABILITIES AND STATS WITH THEIR ATTRIBUTES **********/
		if (fieldName === "vim") {
			updateStats(["charm", "inspire", "mettle", "perception"], difference)
			getAttrs(["courage", "courage_max"], (vals) => {
				setAttrs({
					courage_max: parseInt(vals["courage_max"]) + difference,
					courage: parseInt(vals["courage"]) + difference
				})
			})

		}
		else if (fieldName === "vigor") {
			const newVals = updateStats(["athletics", "intimidate", "might", "vitality"], difference)
			setAttrs({
				attack: val,
				inventory_slots_max: 20 + parseInt(String(newVals["might"])) + parseInt(String(newVals["vitality"]))
			})
		}
		else if (fieldName === "knack") {
			updateStats(["nimbleness", "search", "sneak", "trickery"], difference)
			setAttrs({
				defense: parseInt(String(val)) > 0 ? -parseInt(String(val)) : "+" + (-parseInt(String(val))),
			})
		}
		else if (fieldName === "knowhow") {
			updateStats(["lore", "realms", "tinker", "wilderness"], difference)
			setAttrs({
				quest_pts: parseInt(String(val)) + 3
			})
		}
		else if (fieldName === "might") {
			getAttrs(["vitality"], (vals) => {
				setAttrs({
					inventory_slots_max: 20 + parseInt(String(val)) + parseInt(vals["vitality"])
				})
			})
		}
		else if (fieldName === "vitality") {
			getAttrs(["might"], (vals) => {
				setAttrs({
					inventory_slots_max: 20 + parseInt(String(val)) + parseInt(vals["might"])
				})
			})
		}
	})
})
//********* VALIDATE UNSIGNED NUMBER VALUES ON CHANGE (FOR FIREFOX BROWSER) **********/
on(unsigned.map(field => "change:" + field).join(" "), (eventinfo) => {
	const fieldName = eventinfo.sourceAttribute
	getAttrs([fieldName], (values) => {
		let val = parseInt(values[fieldName])
		if (isNaN(val)) {
			setAttrs({
				[fieldName]: 0
			})
		}
	})
})
//********* VALIDATE ALL NUMBER VALUES ON CHARACTER SHEET OPEN **********/
on("sheet:opened", () => {

	signed.forEach((fieldName) => {
		getAttrs([fieldName, "clamp_modifiers"], (values) => {
			let val = parseInt(values[fieldName])
			const clamp = values["clamp_modifiers"] === "true"
			if (isNaN(val)) {
				setAttrs({
					[fieldName]: "+0"
				})
			}
			else if (clamp && val < -3) {
				setAttrs({
					[fieldName]: "-3"
				})
			}
			else if (clamp && val > 3) {
				setAttrs({
					[fieldName]: "+3"
				})
			}
			else if (val >= 0) {
				setAttrs({
					[fieldName]: "+" + val
				})
			}
			else {
				setAttrs({
					[fieldName]: val
				})
			}
		})
	})
	unsigned.forEach((fieldName) => {
		getAttrs([fieldName], (values) => {
			if (values[fieldName] === "") {
				if (fieldName === "inventory_slots_max") {
					setAttrs({
						[fieldName]: 20
					})
				}
				else if (fieldName === "courage_max" || fieldName === "courage") {
					setAttrs({
						[fieldName]: 12
					})
				}
				else if (fieldName === "quest_pts") {
					setAttrs({
						[fieldName]: 3
					})
				}
				else {
					setAttrs({
						[fieldName]: 0
					})
				}
			}
		})
	})
	//********* SET DEFAULT VALUE FOR DREAD **********/
	getAttrs(["dread"], (values) => {
		let val = values["dread"]
		if (val === undefined || val === "") {
			setAttrs({
				dread: "1d4"
			})
		}
	})
})
//********* CLASS CHANGE HANDLER **********/
on("change:class", (eventinfo) => {
	let key = eventinfo.newValue
	if (key === getTranslationByKey('bard')) {
		key = "bard";
	}
	else if (key === getTranslationByKey('dungeoneer')) {
		key = "dungeoneer";
	}
	else if (key === getTranslationByKey('gnome')) {
		key = "gnome";
	}
	else if (key === getTranslationByKey('knight-errant')) {
		key = "knight-errant";
	}
	else if (key === getTranslationByKey('loyal-chum')) {
		key = "loyal-chum";
	}
	else if (key === getTranslationByKey('rascal')) {
		key = "rascal";
	}

	getAttrs(["hidden_class", "vim"], (values) => {
		// Same class - no change needed
		if (values["hidden_class"] === key) return

		const v = parseInt(values["vim"])
		let dread = "1d4"
		let courage_max = 12 + v

		if (key === "bard") { dread = "1d4"; courage_max = v + 12; }
		else if (key === "dungeoneer") { dread = "1d6"; courage_max = v + 13; }
		else if (key === "gnome") { dread = "1d8"; courage_max = v + 14; }
		else if (key === "knight-errant") { dread = "1d10"; courage_max = v + 15; }
		else if (key === "loyal-chum") { dread = "1d6"; courage_max = v + 13; }
		else if (key === "rascal") { dread = "1d8"; courage_max = v + 14; }
		else return

		setAttrs({
			dread: dread,
			courage_max: courage_max,
			courage: courage_max,
			hidden_class: key
		})
	})
})

OBR.onReady(async () => {
	isReady = true;
	initRepeatingSections();
	await loadSheetData();

	// Listen for room metadata changes
	OBR.room.onMetadataChange(async (metadata) => {
		const playerId = await OBR.player.getId();
		const key = `${ID}/player/${playerId}`;
		const newMetadata = metadata[key] as Record<string, string | number>;
		if (newMetadata) {
			if (JSON.stringify(newMetadata) !== JSON.stringify(localState)) {
				console.log("Remote room metadata changed, updating sheet...", newMetadata);
				localState = newMetadata;
				setAttrs(localState);
			}
		}
	});
});
