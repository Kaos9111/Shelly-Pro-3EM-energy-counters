# ⚡️ Multi-Period Energy Counters for Home Assistant (v0.2)

This script is designed for the **Shelly Pro 3 EM** energy meter (tested with FW: v1.7.1, but may work on others) and provides comprehensive energy consumption tracking directly on the Shelly device.

It automatically creates and manages virtual components for **Daily**, **Monthly**, **Yearly**, and a **Manually Resettable Billing Period** consumption. These virtual meters are fully compatible with **Home Assistant** via the Shelly integration, offering persistent and easily manageable energy sensors.

<img width="255" alt="image" src="https://github.com/user-attachments/assets/74f0262f-93f3-4532-b1d8-7617a36c3410">  

---

## ✨ New in Version 0.2

Version 0.2 introduces a dedicated, manually resettable counter for tracking consumption over a custom **Billing Period**, alongside stability improvements.

* **Manual Billing Counter:** A new virtual counter, "Abrechnungszeitraum" (Billing Period), is added.
* **Virtual Reset Button:** A dedicated virtual button allows manual resetting of the Billing Period counter directly from the Shelly web UI or Home Assistant.
* **Resilience & Stability:** Improved component creation logic and added a cooldown mechanism (`syncCooldown`) to prevent excessive calls during billing sync operations.
* **Reset Logging:** Automatic resets for daily, monthly, and yearly counters are logged using the Shelly KVS (Key-Value Store) to ensure persistence and prevent double-resets after reboots.

---

## 🚀 Key Features

* **Persistent Energy Tracking:** Measures active power consumption, converts it to **kWh**, and stores the running totals in virtual components.
    <img width="1374" alt="image" src="https://github.com/user-attachments/assets/2326cdf4-b8bd-49a6-a248-0e39a6fd4b05">

* **Automatic Resets:**
    * **Daily Counter:** Resets at midnight.
    * **Monthly Counter:** Resets on the 1st of each month.
    * **Yearly Counter:** Resets on January 1st.

* **Manual Billing Reset:**
    * The **"Abrechnungszeitraum"** counter can be reset at any time using the corresponding virtual button.
    * The reset time is saved, ensuring the counter remains at zero even after a device reboot until the next power measurement.

* **Home Assistant Integration:** All virtual counters and the reset button appear as sensors/entities in Home Assistant, enabling direct monitoring and control.
    <img width="1401" alt="image" src="https://github.com/user-attachments/assets/58d08d7c-33fb-49ec-a71f-995387e07009">

---

## 🛠️ Installation and Configuration

1.  **Copy the Script:** Paste the entire script code into the Shelly code editor.
2.  **Save and Start:** Give the script a name (e.g., `kombizähler`), save it, and press **Start**.
    <img width="1391" alt="image" src="https://github.com/user-attachments/assets/71ef8725-e463-44cc-ab15-64d784d55420">
3.  **Enable Auto-Start:** Ensure the script is configured to **Auto-start on power loss / reboot**.
   
    <img width="250" alt="image" src="https://github.com/user-attachments/assets/1385ab48-0076-43d0-b457-963026b35612">

The required virtual `number` components (for the counters) and the `button` component (for the billing reset) will be created **automatically** upon the script's first run.

### Customization

You can adjust several variables at the beginning of the script:

* `let log = 1;` : Set to `0` to disable console logging.
* `let componentName = "Tagesverbrauch";` : Change the display name for the daily counter.
* `let saveIntervalSec = 10;` : How often the current values are saved to the virtual components (default: 10 seconds).
* `let desiredDayId = 200;` : **Important:** If you have existing virtual components, change the ID numbers (`desiredDayId`, `desiredMonthId`, etc.) to an unused range (e.g., start at 300) to avoid conflicts.

---
