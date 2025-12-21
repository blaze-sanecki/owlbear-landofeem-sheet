import './style.css'
import OBR from "@owlbear-rodeo/sdk";
import { rollDice } from './dice';
import { showCustomNotification } from './notification';
import { showContextMenu } from './context_menu';

// Helper functions
let isScriptChange = false;
let isLoading = false;
let isReady = false;
const ID = "quest.jelonek.owlbear.eem";
const ROOM_METADATA_ID = "quest.jelonek.owlbear.eem/room_data";
let localState: Record<string, any> = {};
let saveTimeout: number | undefined;
let draggedRowId: string | null = null;
let dragProxy: HTMLElement | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

//********* DEFINE SIGNED AND UNSIGNED ATTRIBUTES **********/
const signed = ["attack", "defense", "vim", "charm", "inspire", "mettle", "perception", "vigor", "athletics", "intimidate", "might", "vitality", "knack", "nimbleness", "search", "sneak", "trickery", "knowhow", "lore", "realms", "tinker", "wilderness", "treasure_hunting"];
const unsigned = ["courage", "courage_max", "quest_pts", "block", "inventory_slots", "inventory_slots_max", "material_number", "coins_copper", "coins_silver", "coins_gold", "coins_ancient", "rations_d6", "rations_d8", "rations_d10", "lv", "xp"];
const textfields = ["character_name", "class", "folk", "homeland", "proficiencies", "conditions", "deficiencies", "heroic_titles", "dread", "worn", "carried", "material_elemental", "material_fish", "material_beast", "material_herb", "ideals", "flaws", "personal_quest", "backstory", "relationships", "other_notes"];
const checkboxes = ["overburdened", "tired"];
const radios = ["save_slot", "clamp_modifiers", "clamp_roll_modifier"];

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
		elements.forEach(element => {
			// Skip elements inside the repeating section template
			if (element.closest('fieldset.repeating_skills')) return;

			if (element.tagName === 'SPAN') {
				element.textContent = String(value);
			} else {
				const input = element as HTMLInputElement;
				if (input) {
					if (input.type === 'radio') {
						if (input.value === String(value)) {
							input.checked = true;
						} else {
							input.checked = false;
						}
					} else if (input.type === 'checkbox') {
						input.checked = String(value) === 'true';
						value = input.checked ? "true" : "false";
					} else {
						input.value = String(value);
						input.setAttribute('value', String(value));
					}
					//input.dispatchEvent(new Event('change', { bubbles: true }));
				}
			}
			// Save the new value
			if (!isLoading) {
				saveSheetData({ [key]: value });
			}
		});
	});
	isScriptChange = false;
};

const resetAttrs = (updateDOM = true) => {
	console.log("Resetting attributes to default values...");
	isScriptChange = true;
	localState = {};

	const allAttrs = [...signed, ...unsigned, ...textfields, ...checkboxes, ...radios];

	allAttrs.forEach(key => {
		const elements = document.querySelectorAll(`[name="attr_${key}"]`);
		elements.forEach(element => {
			if (element.tagName === 'SPAN') {
				if (updateDOM) element.textContent = '';
			} else {
				const input = element as HTMLInputElement;
				if (input) {
					if (input.type === 'radio') {
						if (updateDOM) input.checked = input.defaultChecked;
						if (input.defaultChecked) localState[key] = input.value;
					} else if (input.type === 'checkbox') {
						if (updateDOM) input.checked = input.defaultChecked;
						if (input.defaultChecked) localState[key] = input.value || "on";
						else localState[key] = "0";
					} else {
						if (updateDOM) input.value = input.defaultValue;
						localState[key] = input.defaultValue;
					}
				}
			}
		});
	});

	// Clear repeating sections
	if (updateDOM) document.querySelectorAll('.repcontainer').forEach(el => el.innerHTML = '');

	isScriptChange = false;
};

const saveSheetData = (data: Record<string, any>) => {
	if (!isReady) return;

	// Update local state
	localState = { ...localState, ...data };

	// Debounce save
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = window.setTimeout(async () => {
		try {
			const playerId = await OBR.player.getId();
			let saveSlot;
			await getAttrs(['save_slot'], (vals) => saveSlot = vals['save_slot']);
			let key = `${ID}/players/${playerId}/save_slot_${saveSlot || 1}`;
			localStorage.setItem(key, JSON.stringify(localState));
			localStorage.setItem(`${ID}/players/${playerId}/last_save_slot`, String(saveSlot || 1));
			console.log("Save completed successfully local storage at:", key);
		} catch (error) {
			console.error("Error saving metadata:", error);
		}
	}, 500);
};

const loadSheetData = async () => {
	isLoading = true;
	resetAttrs(false);
	try {
		const playerId = await OBR.player.getId();
		const saveSlot = localStorage.getItem(`${ID}/players/${playerId}/last_save_slot`) || "1";
		let key = `${ID}/players/${playerId}/save_slot_${saveSlot}`;
		localState = { ...localState, ...JSON.parse(localStorage.getItem(key) || "{}") };

		// Ensure save_slot is set to the current slot, even if data was empty
		localState["save_slot"] = saveSlot;

		console.log("Local data loaded", key, localState);
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
	validate_data();
	isLoading = false;
};

// Attach input listeners for repeating sections and special cases
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
	control.innerHTML = `<button type="button" class="btn btn-danger repcontrol_del">⨯</button><a class="btn repcontrol_move" draggable="true">≡</a>`;
	item.appendChild(control);

	// Clone all children of the fieldset
	Array.from(fieldset.children).forEach(child => {
		const clone = child.cloneNode(true) as HTMLElement;
		item.appendChild(clone);
	});

	// Rename inputs to include rowId
	item.querySelectorAll('[name^="attr_"]').forEach(el => {
		const input = el as HTMLInputElement;
		const name = input.getAttribute('name');
		if (name) {
			const newName = name.replace('attr_', `attr_repeating_skills_${rowId}_`);
			input.setAttribute('name', newName);
		}
	});

	// Attach share button listener
	const shareBtn = item.querySelector('button[name="act_share"]');
	if (shareBtn) {
		shareBtn.addEventListener('click', async () => {
			const skill = localState.repeating_skills?.find((s: any) => s.id === rowId);
			const name = (skill["skillname"] || "Unknown Skill").toUpperCase();
			const desc = (skill["skilldescription"] || "").replace(/\n/g, '<br>');
			showCustomNotification(name, desc, 12000);
		});
	}


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
	} else {
		// Clear potential dirty values from template
		item.querySelectorAll('input[type="text"], textarea').forEach(el => {
			const input = el as HTMLInputElement;
			input.value = "";
			input.setAttribute('value', "");
			if (input.tagName === 'TEXTAREA' && input.parentElement?.classList.contains('sheet-auto-expand')) {
				const span = input.parentElement?.querySelector('span');
				if (span) span.textContent = "";
			}
		});
	}

	// Add delete listener
	const delBtn = item.querySelector('.repcontrol_del');
	if (delBtn) {
		delBtn.addEventListener('click', () => {
			item.remove();
			deleteRepeatingRowData(rowId);

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
			document.body.classList.add('is-dragging');

			e.stopPropagation();
		});

		moveHandle.addEventListener('drag', (e) => {
			if (dragProxy && e.clientX !== 0 && e.clientY !== 0) {
				dragProxy.style.top = `${e.clientY - dragOffsetY}px`;
			}
		});

		moveHandle.addEventListener('dragend', () => {
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
				const rowId = crypto.randomUUID();
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
					const share = item.querySelector('.btn-share');
					if (share) (share as HTMLElement).style.display = isEdit ? 'none' : '';

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
const buttonlist = ["attributes", "inventory", "background", "notes", "history", "settings"]
buttonlist.forEach(button => {
	const elements = document.querySelectorAll(`[name="act_${button}"]`);
	elements.forEach(el => {
		el.addEventListener('click', () => {
			setAttrs({
				sheetTab: button
			})
		});
	});
})

//********* IMPORT / EXPORT **********/
const exportButton = document.querySelector(`[name="act_export"]`);
if (exportButton) {
	exportButton.addEventListener('click', () => {
		const dataStr = JSON.stringify(localState, null, 2);
		const blob = new Blob([dataStr], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const date = new Date();
		const timestamp = date.toLocaleDateString('en-US').replace(/\//g, '-') + '_' + date.toLocaleTimeString('en-US').replace(/:/g, '-').replace(/ /g, '_');
		const charName = (localState['character_name'] || 'character').replace(/ /g, '_');
		a.download = `${charName}_${timestamp}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	});
}

const importButton = document.querySelector(`[name="act_import"]`);
if (importButton) {
	importButton.addEventListener('click', () => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const content = e.target?.result as string;
					const data = JSON.parse(content);

					isLoading = true;

					// Preserve current save slot
					const currentSaveSlot = localState['save_slot'] || 1;

					// Reset current state
					resetAttrs();

					// Update local state
					localState = { ...localState, ...data };

					// Restore save slot
					localState['save_slot'] = currentSaveSlot;

					// Reconstruct repeating sections if present
					if (localState.repeating_skills && Array.isArray(localState.repeating_skills)) {
						reconstructRepeatingSections(localState.repeating_skills);
					} else {
						reconstructRepeatingSections([]);
					}

					// Update UI
					setAttrs(localState);

					// Validate data (fill defaults)
					validate_data();

					// Sync localState with DOM after validation
					const allAttrs = [...signed, ...unsigned, ...textfields, ...checkboxes, ...radios];
					getAttrs(allAttrs, (values) => {
						localState = { ...localState, ...values };
						isLoading = false;
						// Save to storage
						saveSheetData(localState);
						console.log("Import successful");
					});

				} catch (err) {
					console.error("Error importing file:", err);
					alert("Error importing file. Please check the console for details.");
					isLoading = false;
				}
			};
			reader.readAsText(file);
		};
		input.click();
	});
}



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

signed.forEach(fieldName => {
	const elements = document.querySelectorAll(`[name="attr_${fieldName}"]`);
	elements.forEach(el => {
		el.addEventListener('focus', (e) => {
			const target = e.target as HTMLInputElement;
			let oldValue = parseInt(target.getAttribute('value') || "0")
			if (isNaN(oldValue)) {
				oldValue = 0
			}
			target.setAttribute('data-oldvalue', oldValue > 0 ? ("+" + oldValue) : oldValue.toString())
		});
		el.addEventListener('change', (e) => {
			if (isScriptChange) {
				return
			}
			const target = e.target as HTMLInputElement;
			let oldValue = parseInt(target.getAttribute('data-oldvalue') || "0")
			getAttrs([fieldName, "clamp_modifiers"], (values) => {
				//********* IGNORE SHEETWORKER EVENTS **********/
				const clamp = values["clamp_modifiers"] === "true"
				//********* CLAMP TO -3 +3 **********/
				let newValue = parseInt(target.value)
				if (isNaN(newValue)) {
					newValue = 0
				}
				else if (clamp && newValue < -3) {
					newValue = -3
				}
				else if (clamp && newValue > 3) {
					newValue = 3
				}
				setAttrs({
					[fieldName]: newValue >= 0 ? ("+" + newValue) : newValue.toString()
				})
				const difference = (newValue - oldValue)
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
						attack: newValue,
						inventory_slots_max: 20 + parseInt(String(newVals["might"])) + parseInt(String(newVals["vitality"]))
					})
				}
				else if (fieldName === "knack") {
					updateStats(["nimbleness", "search", "sneak", "trickery"], difference)
					setAttrs({
						defense: parseInt(String(newValue)) > 0 ? -parseInt(String(newValue)) : "+" + (-parseInt(String(newValue))),
					})
				}
				else if (fieldName === "knowhow") {
					updateStats(["lore", "realms", "tinker", "wilderness"], difference)
					setAttrs({
						quest_pts: parseInt(String(newValue)) + 3
					})
				}
				else if (fieldName === "might") {
					getAttrs(["vitality"], (vals) => {
						setAttrs({
							inventory_slots_max: 20 + parseInt(String(newValue)) + parseInt(vals["vitality"])
						})
					})
				}
				else if (fieldName === "vitality") {
					getAttrs(["might"], (vals) => {
						setAttrs({
							inventory_slots_max: 20 + parseInt(String(newValue)) + parseInt(vals["might"])
						})
					})
				}
			})
		});
	});
});

unsigned.forEach(fieldName => {
	const elements = document.querySelectorAll(`[name="attr_${fieldName}"]`);
	elements.forEach(el => {
		el.addEventListener('change', (e) => {
			const target = e.target as HTMLInputElement;
			//********* IGNORE SHEETWORKER EVENTS **********/
			if (isScriptChange) {
				return
			}
			const newValue = parseInt(target.value)
			if (isNaN(newValue)) {
				setAttrs({
					[fieldName]: 0
				})
			}
			else {
				setAttrs({
					[fieldName]: newValue
				})
			}
		});
	});
});

textfields.forEach(fieldName => {
	const elements = document.querySelectorAll(`[name="attr_${fieldName}"`);
	elements.forEach(el => {
		el.addEventListener('change', (e) => {
			//********* IGNORE SHEETWORKER EVENTS **********/
			if (isScriptChange) {
				return
			}
			const target = e.target as HTMLInputElement;
			setAttrs({
				[fieldName]: target.value
			})
		})
	})
})

radios.forEach(fieldName => {
	const elements = document.querySelectorAll(`[name="attr_${fieldName}"`);
	if (fieldName === "save_slot") {
		elements.forEach(el => {
			el.addEventListener('change', async (e) => {
				//********* IGNORE SHEETWORKER EVENTS **********/
				if (isScriptChange || isLoading) {
					return
				}
				const target = e.target as HTMLInputElement;

				// Cancel any pending save to prevent overwriting the new slot with old data
				if (saveTimeout) clearTimeout(saveTimeout);

				const playerId = await OBR.player.getId();

				// Save current state to the previous slot
				const oldSlot = localState["save_slot"] || 1;
				const oldKey = `${ID}/players/${playerId}/save_slot_${oldSlot}`;
				localStorage.setItem(oldKey, JSON.stringify(localState));

				let saveSlot = parseInt(target.value);
				// Save the selected save slot
				localStorage.setItem(`${ID}/players/${playerId}/last_save_slot`, String(saveSlot || 1));
				// Load the selected save slot
				await loadSheetData();
				console.log("Save slot " + saveSlot + " loaded.", localState);
			});
		});
	}
	else elements.forEach(el => {
		el.addEventListener('change', (e) => {
			//********* IGNORE SHEETWORKER EVENTS **********/
			if (isScriptChange) {
				return
			}
			const target = e.target as HTMLInputElement;
			setAttrs({
				[fieldName]: target.value
			})
		})
	})
})

checkboxes.forEach(fieldName => {
	const elements = document.querySelectorAll(`[name="attr_${fieldName}"`);
	elements.forEach(el => {
		el.addEventListener('change', (e) => {
			//********* IGNORE SHEETWORKER EVENTS **********/
			if (isScriptChange) {
				return
			}
			const target = e.target as HTMLInputElement;
			setAttrs({
				[fieldName]: target.checked ? "true" : "false"
			})
		})
	})
})

//********* VALIDATE ALL NUMBER VALUES ON CHARACTER SHEET OPEN **********/
const validate_data = () => {
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
	//********* SET SHEET VERSION, WE CAN THEN DETECT IF DATA IS OUTDATED **********/
	setAttrs({
		version: document.querySelector(`[type="hidden"][name="attr_version"]`)!.getAttribute('value') || "1.0.0"
	})
}

document.querySelector(`[name="attr_class"]`)!.addEventListener('change', (e) => {
	let newClass = (e.target as HTMLInputElement).value;

	getAttrs(["hidden_class", "vim"], (values) => {
		// Same class - no change needed
		if (values["hidden_class"] === newClass) return

		const v = parseInt(values["vim"])
		let dread = "1d4"
		let courage_max = 12 + v

		if (newClass === "bard") { dread = "1d4"; courage_max = v + 12; }
		else if (newClass === "dungeoneer") { dread = "1d6"; courage_max = v + 13; }
		else if (newClass === "gnome") { dread = "1d8"; courage_max = v + 14; }
		else if (newClass === "knight-errant") { dread = "1d10"; courage_max = v + 15; }
		else if (newClass === "loyal-chum") { dread = "1d6"; courage_max = v + 13; }
		else if (newClass === "rascal") { dread = "1d8"; courage_max = v + 14; }
		else return

		setAttrs({
			dread: dread,
			courage_max: courage_max,
			courage: courage_max,
			hidden_class: newClass
		})
	})
});

const updateRoomRollHistory = async (newEntry: string) => {
	const metadata = await OBR.room.getMetadata();
	const currentHistory = (metadata[ROOM_METADATA_ID] as any)?.roll_history || "";
	const maxEntries = 18;

	// Limit history to maxEntries
	const historyLines = currentHistory.split('\n').filter((line: string) => line.trim() !== '');
	if (historyLines.length >= maxEntries) {
		historyLines.splice(maxEntries - 1); // Keep only the most recent entries
	}
	const trimmedHistory = historyLines.join('\n');
	const newHistory = newEntry + "\n" + trimmedHistory;
	await OBR.room.setMetadata({
		[ROOM_METADATA_ID]: {
			roll_history: newHistory
		}
	});
};

const loadRoomRollHistory = async () => {
	const metadata = await OBR.room.getMetadata();
	const history = (metadata[ROOM_METADATA_ID] as any)?.roll_history || "";
	const textarea = document.querySelector('[name="attr_room_roll_history"]') as HTMLTextAreaElement;
	if (textarea) {
		textarea.value = history;
	}
};

const getAdditionalModifier = (title: string = 'Additional Modifier'): Promise<number | null> => {
	return new Promise((resolve) => {
		const channel = new BroadcastChannel('owlbear-landofeem-modifier');
		const modalId = 'landofeem-modifier-modal';
		let resolved = false;

		const cleanup = () => {
			if (resolved) return;
			resolved = true;
			channel.close();
		};

		channel.onmessage = (event) => {
			if (event.data.type === 'submit') {
				resolve(event.data.value);
			} else {
				resolve(null);
			}
			cleanup();
		};

		OBR.modal.open({
			id: modalId,
			url: `/modifier.html?title=${encodeURIComponent(title)}`,
			height: 160,
			width: 250,
		});
	});
};

const handleRoll = async (attr: string, rollType: 'normal' | 'advantage' | 'disadvantage', askForModifier: boolean = false) => {
	let extraMod = 0;
	let defenseMod = 0;

	if (askForModifier) {
		const mod = await getAdditionalModifier('Additional Modifier');
		if (mod === null) return;
		extraMod = mod;
	}

	if (attr === 'attack') {
		const def = await getAdditionalModifier('Adversary Defense');
		if (def === null) return;
		defenseMod = def;
	}

	const attrsToGet = [attr];
	if (attr === 'attack') {
		attrsToGet.push('dread');
	}
	getAttrs(attrsToGet, async (values) => {
		const valStr = values[attr] || "0";
		const attrMod = parseInt(valStr) || 0;
		const modifier = attrMod + extraMod + defenseMod;

		let rollResult;
		let rollDescription = "";
		let finalTotal = 0;

		if (rollType === 'normal') {
			rollResult = rollDice(12, 1, modifier);
			rollDescription = `(${rollResult.rolls.join(', ')})`;
			finalTotal = rollResult.total;
		} else {
			// For advantage/disadvantage, roll 2 dice
			rollResult = rollDice(12, 2, modifier);
			if (rollType === 'advantage') {
				finalTotal = rollResult.advantageTotal;
				rollDescription = `[A](${rollResult.rolls.join(', ')})`;
			} else {
				finalTotal = rollResult.disadvantageTotal;
				rollDescription = `[D](${rollResult.rolls.join(', ')})`;
			}
		}

		const label = attr.charAt(0).toUpperCase() + attr.slice(1).replace('_', ' ');
		const playerName = await localState['character_name'] || await OBR.player.getName() || "Unknown";
		const title = `${playerName} - ${label}`;
		let message = `${rollDescription}${modifier >= 0 ? ' + ' : ' - '}${Math.abs(modifier)} = <b>${finalTotal}</b>`;

		if (attr === 'attack') {
			const dreadVal = values['dread'] || "1d4";
			const parts = dreadVal.toLowerCase().split('d');
			if (parts.length === 2) {
				const count = parseInt(parts[0]) || 1;
				const sides = parseInt(parts[1]) || 4;
				const dreadResult = rollDice(sides, count, 0);
				message += `<br>Dread: <b>${dreadResult.total}</b>`;
			}
		}

		showCustomNotification(title, message, 6000);

		// Update roll history
		const timestamp = new Date();
		const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
		const newEntry = `[${timeString}] ${playerName} - ${label}: ${message.replace('<br>', ' | ').replace(/<b>|<\/b>/g, '')}`;
		await updateRoomRollHistory(newEntry);
	});
};

const initRollButtons = () => {
	signed.forEach(attr => {
		const btn = document.querySelector(`button[name="act_${attr}"]`);
		if (btn) {
			// Left click - Normal Roll
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				handleRoll(attr, 'normal', false);
			});

			// Right click - Context Menu
			btn.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				const mouseEvent = e as MouseEvent;
				showContextMenu(mouseEvent.clientX, mouseEvent.clientY, [
					{
						label: 'Roll Normal + Extra Modifier',
						action: () => handleRoll(attr, 'normal', true)
					},
					{
						label: 'Roll with Advantage',
						action: () => handleRoll(attr, 'advantage', true)
					},
					{
						label: 'Roll with Disadvantage',
						action: () => handleRoll(attr, 'disadvantage', true)
					}
				]);
			});
		}
	});
};

OBR.onReady(async () => {
	console.log("EEM Sheet Script Ready");
	isReady = true;
	initRepeatingSections();
	initRollButtons();

	// Load initial history
	await loadRoomRollHistory();

	// Listen for room metadata changes
	OBR.room.onMetadataChange((metadata) => {
		const history = (metadata[ROOM_METADATA_ID] as any)?.roll_history;
		if (history !== undefined) {
			const textarea = document.querySelector('[name="attr_room_roll_history"]') as HTMLTextAreaElement;
			if (textarea) {
				textarea.value = history;
			}
		}
	});
	await loadSheetData();
});
