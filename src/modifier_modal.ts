import OBR from '@owlbear-rodeo/sdk';

const channel = new BroadcastChannel('owlbear-landofeem-modifier');

OBR.onReady(async () => {
	// Set title from query param
	const urlParams = new URLSearchParams(window.location.search);
	const title = urlParams.get('title');
	if (title) {
		const header = document.querySelector('h3');
		if (header) header.textContent = title;
	}

	const modifierInput = document.getElementById('modifier') as HTMLInputElement;
	const confirmBtn = document.getElementById('confirm') as HTMLButtonElement;
	const cancelBtn = document.getElementById('cancel') as HTMLButtonElement;

	// Focus input on load
	setTimeout(() => {
		modifierInput.focus();
		modifierInput.select();
	}, 100);

	// Handle Enter key in input
	modifierInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			submitModifier();
		} else if (e.key === 'Escape') {
			cancelModifier();
		}
	});

	confirmBtn.addEventListener('click', () => {
		submitModifier();
	});

	cancelBtn.addEventListener('click', () => {
		cancelModifier();
	});

	function submitModifier() {
		const value = parseInt(modifierInput.value, 10) || 0;
		channel.postMessage({ type: 'submit', value });
		OBR.modal.close('landofeem-modifier-modal');
	}

	function cancelModifier() {
		channel.postMessage({ type: 'cancel' });
		OBR.modal.close('landofeem-modifier-modal');
	}

	window.addEventListener('beforeunload', () => {
		channel.postMessage({ type: 'cancel' });
	});
});
