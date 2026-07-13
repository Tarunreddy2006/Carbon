// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Form Validation Helpers
// ═══════════════════════════════════════════════════════════════════════════

const FormValidator = {
    /**
     * Validate all fields in a form element.
     * Returns { valid: boolean, errors: { fieldName: string } }
     */
    validate(formEl) {
        const errors = {};
        const inputs = formEl.querySelectorAll('[data-validate]');

        inputs.forEach(input => {
            const rules = input.dataset.validate.split('|');
            const name = input.name || input.id;
            const value = input.value.trim();
            const label = input.dataset.label || Utils.capitalize(name.replace(/[_-]/g, ' '));

            for (const rule of rules) {
                const [ruleName, param] = rule.split(':');

                switch (ruleName) {
                    case 'required':
                        if (!value) errors[name] = `${label} is required`;
                        break;
                    case 'email':
                        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
                            errors[name] = `Please enter a valid email`;
                        break;
                    case 'min':
                        if (value && value.length < parseInt(param))
                            errors[name] = `${label} must be at least ${param} characters`;
                        break;
                    case 'max':
                        if (value && value.length > parseInt(param))
                            errors[name] = `${label} cannot exceed ${param} characters`;
                        break;
                    case 'number':
                        if (value && isNaN(Number(value)))
                            errors[name] = `${label} must be a number`;
                        break;
                    case 'positive':
                        if (value && Number(value) <= 0)
                            errors[name] = `${label} must be greater than 0`;
                        break;
                    case 'phone':
                        if (value && !/^[\+]?[\d\s\-\(\)]{7,20}$/.test(value))
                            errors[name] = `Please enter a valid phone number`;
                        break;
                    case 'match':
                        const matchEl = formEl.querySelector(`[name="${param}"], #${param}`);
                        if (matchEl && value !== matchEl.value)
                            errors[name] = `Passwords do not match`;
                        break;
                }

                if (errors[name]) break; // Stop on first error per field
            }
        });

        // Show/clear inline errors
        this.displayErrors(formEl, errors);

        return { valid: Object.keys(errors).length === 0, errors };
    },

    /**
     * Display inline errors on form fields.
     */
    displayErrors(formEl, errors) {
        // Clear all previous errors
        formEl.querySelectorAll('.form-error').forEach(el => el.remove());
        formEl.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

        // Show new errors
        for (const [name, message] of Object.entries(errors)) {
            const input = formEl.querySelector(`[name="${name}"], #${name}`);
            if (!input) continue;

            input.classList.add('input-error');

            const errorEl = document.createElement('div');
            errorEl.className = 'form-error';
            errorEl.textContent = message;

            const wrapper = input.closest('.form-group') || input.parentElement;
            wrapper.appendChild(errorEl);
        }
    },

    /**
     * Clear all validation errors from a form.
     */
    clearErrors(formEl) {
        formEl.querySelectorAll('.form-error').forEach(el => el.remove());
        formEl.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    },

    /**
     * Get form data as an object.
     */
    getData(formEl) {
        const data = {};
        const formData = new FormData(formEl);
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }
        return data;
    },
};

if (typeof window !== 'undefined') {
    window.Form = FormValidator;
}
