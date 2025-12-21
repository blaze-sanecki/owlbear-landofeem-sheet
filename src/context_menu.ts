export interface ContextMenuOption {
	label: string;
	action: () => void;
}

export function showContextMenu(x: number, y: number, options: ContextMenuOption[]) {
	// Remove existing context menu if any
	const existing = document.getElementById('custom-context-menu');
	if (existing) {
		existing.remove();
	}

	const menu = document.createElement('div');
	menu.id = 'custom-context-menu';
	menu.style.position = 'fixed';
	menu.style.top = `${y}px`;
	menu.style.left = `${x}px`;
	menu.style.backgroundColor = '#fff';
	menu.style.border = '2px solid #cc9133';
	menu.style.borderRadius = '8px';
	menu.style.padding = '4px 0';
	menu.style.zIndex = '10000';
	menu.style.boxShadow = '0 2px 5px rgba(0,0,0,0.5)';
	menu.style.minWidth = '150px';
	menu.style.overflow = 'hidden';
	menu.style.padding = '0';

	options.forEach(option => {
		const item = document.createElement('div');
		item.textContent = option.label;
		item.style.padding = '8px 12px';
		item.style.cursor = 'pointer';
		item.style.color = '#000';
		item.style.fontFamily = 'DM Sans, Tahoma, Geneva, Verdana, sans-serif';
		item.style.fontSize = '14px';

		item.addEventListener('mouseenter', () => {
			item.style.backgroundColor = '#fff4e7';
			item.style.color = '#cc9133';
		});
		item.addEventListener('mouseleave', () => {
			item.style.backgroundColor = 'transparent';
			item.style.color = '#000';
		});

		item.addEventListener('click', () => {
			option.action();
			menu.remove();
		});

		menu.appendChild(item);
	});

	document.body.appendChild(menu);

	// Close on click outside
	const closeMenu = (e: MouseEvent) => {
		if (!menu.contains(e.target as Node)) {
			menu.remove();
			document.removeEventListener('click', closeMenu);
			document.removeEventListener('contextmenu', closeMenu);
		}
	};

	// Use setTimeout to avoid immediate closing if the click that opened it propagates
	setTimeout(() => {
		document.addEventListener('click', closeMenu);
		document.addEventListener('contextmenu', closeMenu);
	}, 0);
}
