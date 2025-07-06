const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "dishonored-trackers";

globalThis.systemPath = path => `modules/${MODULE_ID}/${path ?? ""}`;
globalThis.templatePath = path => path ? systemPath(`templates/${path}.hbs`) : systemPath("templates");

Hooks.once("init", () => {
    globalThis.dishonored = {
        tracker: new DishonoredMomentumTracker(),
    };

    registerSettings();
});

Hooks.once("ready", async () => {
    registerSocketEvents();

    dishonored.tracker.render(true);
});

function registerSocketEvents() {
    game.socket.on(`module.${MODULE_ID}`, event => {
        if (event.type === "setCounter" && game.user.isGM) {
            DishonoredMomentumTracker.setCounter(event.payload.value, event.payload.type);
        }

        if (event.type === "updateCounter") {
            dishonored.tracker.render(true);
        }
    });
}

class DishonoredMomentumTracker
    extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        actions: {
            decrement: this._onDecrement,
            increment: this._onIncrement,
        },
        classes: ["dishonored"],
        form: {
            closeOnSubmit: false,
            submitOnChange: true,
            handler: DishonoredMomentumTracker._onSubmit,
        },
        tag: "form",
        window: {
            frame: false,
            resizable: false,
        },
    };


    static PARTS = {
        form: {
            template: templatePath("momentum-tracker"),
            classes: ["momentum-tracker"],
        },
    };


    /**
     * Change the counter of (type) by (value)
     * @param diff  How much to change the counter
     * @param type  Type of counter, "momentum" or "chaos"
     */
    static async changeCounter(diff, type) {
        this.checkCounterUpdate(diff, type);

        const newValue = game.settings.get(MODULE_ID, type) + diff;
        await DishonoredMomentumTracker.setCounter(newValue, type);
    }


    // Check user entry. Rerender if error is detected to reset to the correct value
    static checkCounterUpdate(value, type) {
        const updateError = {
            counter: "Dishonored | Error updating Counter: Invalid Counter Type",
            value: "Dishonored | Error updating Counter: Invalid Value Type",
        };

        if (type !== "chaos" && type !== "momentum") {
            ui.notifications.error("Error updating Counter: Invalid Counter Type");
            dishonored.tracker.render(true);
            throw updateError.counter;
        }

        if (value !== 0 && !value || Number.isNaN(value)) {
            ui.notifications.error("Error updating Counter: Invalid Value Type");
            dishonored.tracker.render(true);
            throw updateError.value;
        }
    }


    /**
     * Set the counter of (type) to (value)
     * @param value Value to set counter to
     * @param type  Type of counter, "momentum" or "chaos"
     */
    static async setCounter(value, type) {
        DishonoredMomentumTracker.checkCounterUpdate(value, type);

        if (!game.user.isGM) {
            game.socket.emit(`module.${MODULE_ID}`, {
                type: "setCounter",
                payload: { value, type },
            });
            return;
        }

        value = Number.parseInt(value);

        value = Math.max(0, value);

        if (type === "momentum") {
            value = Math.min(6, value);
        }
        else {
            value = Math.min(99, value);
        }

        await game.settings.set(MODULE_ID, type, value);

        dishonored.tracker.render(true);

        // Emit socket event for users to rerender their counters
        game.socket.emit(`module.${MODULE_ID}`, { type: "updateCounter" });
    }


    static async _onDecrement(event, html) {
        const { resource } = event.target.parentElement?.dataset ?? undefined;

        if (resource) DishonoredMomentumTracker.changeCounter(-1, resource);
    }


    static async _onIncrement(event, html) {
        const { resource } = event.target.parentElement?.dataset ?? undefined;

        if (resource) DishonoredMomentumTracker.changeCounter(1, resource);
    }


    static async _onSubmit(event, form, formData) {
        const { resource } = event.target.dataset ?? undefined;
        const value = event.target.value;
        DishonoredMomentumTracker.setCounter(value, resource);
    }


    get canEditChaos() {
        const chaosEditRole = game.settings.get(MODULE_ID, "chaosPermissionLevel");
        return game.user.isGM || game.user.hasRole(chaosEditRole);
    }


    get canEditMomentum() {
        const momentumEditRole = game.settings.get(MODULE_ID, "momentumPermissionLevel");
        return game.user.isGM || game.user.hasRole(momentumEditRole);
    }


    async _prepareContext(options = {}) {
        const context = await super._prepareContext(options);

        context.canEditChaos = this.canEditChaos;
        context.canEditMomentum = this.canEditMomentum;

        context.chaos = game.settings.get(MODULE_ID, "chaos");
        context.momentum = game.settings.get(MODULE_ID, "momentum");

        return context;
    }
}

function registerSettings() {
    game.settings.register(MODULE_ID, "chaos", {
        scope: "world",
        type: Number,
        default: 0,
        config: false,
    });

    game.settings.register(MODULE_ID, "momentum", {
        scope: "world",
        type: Number,
        default: 0,
        config: false,
    });

    game.settings.register(MODULE_ID, "chaosPermissionLevel", {
        name: game.i18n.localize("dishonored.settings.names.chaosPermissionLevel"),
        hint: game.i18n.localize("dishonored.settings.hints.chaosPermissionLevel"),
        scope: "world",
        type: String,
        default: "ASSISTANT",
        config: true,
        choices: {
            PLAYER: game.i18n.localize("USER.RolePlayer"),
            TRUSTED: game.i18n.localize("USER.RoleTrusted"),
            ASSISTANT: game.i18n.localize("USER.RoleAssistant"),
            GAMEMASTER: game.i18n.localize("USER.RoleGamemaster"),
        },
    });

    game.settings.register(MODULE_ID, "momentumPermissionLevel", {
        name: game.i18n.localize("dishonored.settings.names.momentumPermissionLevel"),
        hint: game.i18n.localize("dishonored.settings.hints.momentumPermissionLevel"),
        scope: "world",
        type: String,
        default: "PLAYER",
        config: true,
        choices: {
            PLAYER: game.i18n.localize("USER.RolePlayer"),
            TRUSTED: game.i18n.localize("USER.RoleTrusted"),
            ASSISTANT: game.i18n.localize("USER.RoleAssistant"),
            GAMEMASTER: game.i18n.localize("USER.RoleGamemaster"),
        },
    });
}