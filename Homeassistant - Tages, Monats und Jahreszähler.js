// for shelly pro3em - FW: v1.7.1
//
// Kombizähler Script v0.2 - 06.11.2025
//            _
//        V__(.)<
//         \_)_)
//
// Dieses Skript verwaltet virtuelle Shelly-Komponenten für den täglichen, monatlichen, jährlichen und Abrechnungszeitraum-Verbrauch.
// Es prüft beim Start, ob die benötigten virtuellen Komponenten existieren und erstellt sie bei Bedarf automatisch.
// Der Verbrauch wird regelmäßig basierend auf der aktuell gemessenen aktiven Leistung (Wirkleistung) aktualisiert.
// 
// Tägliche, monatliche und jährliche Zähler werden automatisch zum jeweiligen Zeitraum zurückgesetzt. 
// Zusätzlich gibt es einen manuellen Abrechnungszähler ("Abrechnungszeitraum"), der per virtuellen Button in der Shelly-Oberfläche
// oder über Home Assistant (via Shelly-Integration) zurückgesetzt werden kann. 
//
// Konsolenausgaben zeigen die aktuellen Verbrauchswerte an und können für Debug-Zwecke aktiviert oder deaktiviert werden.
// Das Skript ist vollständig mit Home Assistant und der Shelly-Integration kompatibel und erlaubt eine direkte Anzeige und Steuerung
// der virtuellen Zähler über Home Assistant.
//
// ---
//
// This script manages virtual Shelly components for daily, monthly, yearly, and billing period consumption.
// Upon startup, it checks if the required virtual components exist and creates them automatically if necessary.
// Consumption is updated regularly based on active power readings.
//
// Daily, monthly, and yearly counters are automatically reset at the start of each new period.
// Additionally, a manual billing counter ("Billing Period") can be reset through a virtual button directly in the Shelly interface
// or via Home Assistant through the Shelly integration.
//
// Console output displays current consumption values and can be enabled or disabled for debugging purposes.
// The script is fully compatible with Home Assistant and integrates seamlessly with the Shelly integration for easy monitoring and control.
//
//
//
// for shelly pro3em v1.7.1 - in progress version 0.2 - 06.11.2025
//
//
//

let energyConsumedKWh = 0.0;
let energyConsumedMonthlyKWh = 0.0;
let energyConsumedYearlyKWh = 0.0;
let energyConsumedBillingKWh = 0.0;

let log = 1;
let componentName = "Tagesverbrauch";
let monthlyComponentName = "Monatsverbrauch";
let yearlyComponentName = "Jahresverbrauch";
let billingComponentName = "Abrechnungszeitraum";

let desiredDayId = 200;
let desiredMonthId = 201;
let desiredYearId = 202;
let desiredBillingId = 203;

let logInterval = 60;
let saveIntervalSec = 10;
let resetCheckIntervalSec = 300; // Erhöht auf 5 Minuten für weniger Aufrufe

let resetKVSKey = componentName + "_Reset";
let monthlyResetKVSKey = monthlyComponentName + "_Reset";
let yearlyResetKVSKey = yearlyComponentName + "_Reset";
let billingResetTimeKey = billingComponentName + "_ResetTime";

if (log > 0) print("Zähler Script gestartet");

let compIdDay = null;
let compIdMonth = null;
let compIdYear = null;
let compIdBilling = null;
let buttonIdBilling = null;

// Synchronisations-Flags
let syncInProgress = false;
let lastSyncTime = 0;
let syncCooldown = 60000; // 60 Sekunden Cooldown zwischen Sync-Aufrufen

function findComponentIdByName(components, name, desiredId) {
  if (!components || !Array.isArray(components)) return null;
  for (let c of components) {
    try {
      if (c && c.key && (c.key.indexOf("number:") === 0 || c.key.indexOf("button:") === 0)) {
        let nm = (c.config && c.config.name) ? c.config.name : c.name;
        if (nm === name) {
          let id = parseInt(c.key.split(":")[1], 10);
          return isNaN(id) ? null : id;
        }
        let id2 = parseInt(c.key.split(":")[1], 10);
        if (!isNaN(id2) && id2 === desiredId) return id2;
      }
    } catch (e) {}
  }
  return null;
}

function checkAndCreateVirtualComponent(name, desiredId, callback) {
  Shelly.call("Shelly.GetComponents", { dynamic_only: true, include: ["config"] }, function(res) {
    let found = (res && res.components) ? findComponentIdByName(res.components, name, desiredId) : null;
    if (found !== null) return callback(found);
    
    Shelly.call("Virtual.Add", {
      type: "number",
      config: {
        name: name,
        unit: "kWh",
        value: 0.0,
        persisted: true,
        meta: { ui: { view: "label", unit: "kWh" } }
      }
    }, function() {
      Timer.set(500, false, function() { // Erhöhte Verzögerung
        Shelly.call("Shelly.GetComponents", { dynamic_only: true, include: ["config"] }, function(r2) {
          let foundId = (r2 && r2.components) ? findComponentIdByName(r2.components, name, desiredId) : null;
          callback(foundId);
        });
      });
    });
  });
}

function checkAndCreateVirtualButton(name, desiredId, callback) {
  Shelly.call("Shelly.GetComponents", { dynamic_only: true, include: ["config"] }, function(res) {
    let found = (res && res.components) ? findComponentIdByName(res.components, name, desiredId) : null;
    if (found !== null) return callback(found);
    
    Shelly.call("Virtual.Add", {
      type: "button",
      config: { name: name, meta: { ui: { view: "button" } } }
    }, function() {
      Timer.set(500, false, function() {
        Shelly.call("Shelly.GetComponents", { dynamic_only: true, include: ["config"] }, function(r2) {
          let foundId = (r2 && r2.components) ? findComponentIdByName(r2.components, name, desiredId) : null;
          callback(foundId);
        });
      });
    });
  });
}

function SetVirtualComponentValue(id, value, callback) {
  if (id === null) {
    if (callback) callback();
    return;
  }
  let v = Math.round(value * 1000) / 1000;
  Shelly.call("Number.Set", { id: id, value: v }, callback || function() {});
}

function LoadVirtualComponentValue(id, callback) {
  if (id === null) return callback(0.0);
  Shelly.call("Number.GetStatus", { id: id }, function(res) {
    callback((res && typeof res.value === "number") ? res.value : 0.0);
  });
}

function setupBillingResetButton() {
  if (buttonIdBilling === null) return;
  
  Shelly.addEventHandler(function(event) {
    if (event && event.component === "button:" + buttonIdBilling &&
        event.info && event.info.event === "single_push") {
      if (log > 0) print("Abrechnungszeitraum Reset gedrückt");
      energyConsumedBillingKWh = 0.0;
      SetVirtualComponentValue(compIdBilling, 0.0);
      
      // Verzögerter KVS-Set Aufruf
      Timer.set(100, false, function() {
        Shelly.call("Sys.GetStatus", {}, function(s) {
          if (s && s.unixtime) {
            Shelly.call("KVS.Set", { key: billingResetTimeKey, value: s.unixtime }, function() {
              if (log > 0) print("Abrechnungs-Reset-Zeitpunkt gespeichert");
            });
          }
        });
      });
    }
  });
}

// Vereinfachte und stabilisierte Sync-Funktion
function syncBillingCounterIfNeeded() {
  let now = Date.now();
  
  // Verhindere parallele Ausführung und zu häufige Aufrufe
  if (syncInProgress || (now - lastSyncTime) < syncCooldown) {
    return;
  }
  
  syncInProgress = true;
  lastSyncTime = now;
  
  if (log > 1) print("Starte Billing-Sync...");
  
  // Hole alle benötigten Daten
  Shelly.call("KVS.Get", { key: billingResetTimeKey }, function(res, err_code) {
    if (err_code !== 0 || !res || typeof res.value === "undefined") {
      syncInProgress = false;
      return;
    }
    
    let lastBillingReset = Number(res.value);
    
    // Systemstatus abrufen
    Shelly.call("Sys.GetStatus", {}, function(status) {
      if (!status || typeof status.unixtime === "undefined") {
        syncInProgress = false;
        return;
      }
      
      let currentTime = status.unixtime;
      let resetDate = new Date(lastBillingReset * 1000);
      let resetDay = resetDate.getDate();
      
      // Aktuellen Tag aus dem Systemstatus berechnen
      let currentDate = new Date(currentTime * 1000);
      let currentDay = currentDate.getDate();
      
      if (resetDay !== currentDay) {
        if (log > 0) print("Sync: Reset-Tag", resetDay, "≠ aktueller Tag", currentDay);
        energyConsumedBillingKWh = energyConsumedKWh;
        SetVirtualComponentValue(compIdBilling, energyConsumedBillingKWh, function() {
          if (log > 0) print("Abrechnungszeitraum synchronisiert:", energyConsumedBillingKWh.toFixed(3), "kWh");
          syncInProgress = false;
        });
      } else {
        syncInProgress = false;
      }
    });
  });
}

// Reset-Funktion 
function resetCounterIfMidnight() {
  Shelly.call("Sys.GetStatus", {}, function(status) {
    if (!status || !status.unixtime) return;
    
    let d = new Date(status.unixtime * 1000);
    let y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    
    // Kombinierte Reset-Prüfung
    let resetChecks = [
      { key: resetKVSKey, current: day, comp: compIdDay, energy: 'energyConsumedKWh', name: componentName },
      { key: monthlyResetKVSKey, current: m, comp: compIdMonth, energy: 'energyConsumedMonthlyKWh', name: monthlyComponentName },
      { key: yearlyResetKVSKey, current: y, comp: compIdYear, energy: 'energyConsumedYearlyKWh', name: yearlyComponentName }
    ];
    
    let completed = 0;
    
    function checkNext() {
      if (completed >= resetChecks.length) return;
      
      let check = resetChecks[completed];
      Shelly.call("KVS.Get", { key: check.key }, function(r) {
        if (!r || r.value != check.current) {
          // Reset benötigt
          eval(check.energy + " = 0.0"); // Energie zurücksetzen
          SetVirtualComponentValue(check.comp, 0.0);
          Shelly.call("KVS.Set", { key: check.key, value: check.current });
          if (log > 0) print(check.name + " zurückgesetzt");
        }
        completed++;
        Timer.set(50, false, checkNext); // Kleine Verzögerung zwischen Aufrufen
      });
    }
    
    checkNext();
  });
}

function doLogging() {
  if (log <= 0) return;
  print(componentName, "=", energyConsumedKWh.toFixed(3), "kWh");
  print(monthlyComponentName, "=", energyConsumedMonthlyKWh.toFixed(3), "kWh");
  print(yearlyComponentName, "=", energyConsumedYearlyKWh.toFixed(3), "kWh");
  print(billingComponentName, "=", energyConsumedBillingKWh.toFixed(3), "kWh");
  print("--------------------");
}

// Timer-Handler
function timerHandler(user_data) {
  let now = Date.now();
  let dt = (now - (user_data.lastTick || now)) / 1000;
  if (dt < 0) dt = 0;
  user_data.lastTick = now;

  let em = Shelly.getComponentStatus("em", 0);
  let power = (em && typeof em.total_act_power === "number") ? em.total_act_power : 0;
  let deltaKWh = (power * dt) / 3600000.0;

  if (deltaKWh > 0) {
    energyConsumedKWh += deltaKWh;
    energyConsumedMonthlyKWh += deltaKWh;
    energyConsumedYearlyKWh += deltaKWh;
    energyConsumedBillingKWh += deltaKWh;
  }

  // Speichern
  user_data.saveAccum = (user_data.saveAccum || 0) + dt;
  if (user_data.saveAccum >= saveIntervalSec) {
    user_data.saveAccum = 0;
    SetVirtualComponentValue(compIdDay, energyConsumedKWh);
    SetVirtualComponentValue(compIdMonth, energyConsumedMonthlyKWh);
    SetVirtualComponentValue(compIdYear, energyConsumedYearlyKWh);
    SetVirtualComponentValue(compIdBilling, energyConsumedBillingKWh);
  }

  // Logging Intervall
  user_data.logAccum = (user_data.logAccum || 0) + dt;
  if (user_data.logAccum >= logInterval) {
    user_data.logAccum = 0;
    doLogging();
  }

  // Reset-Check Intervall
  user_data.resetAccum = (user_data.resetAccum || 0) + dt;
  if (user_data.resetAccum >= resetCheckIntervalSec) {
    user_data.resetAccum = 0;
    resetCounterIfMidnight();
    
    // Sync alle 5 Minuten und mit Cooldown
    if (Math.random() < 0.3) { // Zufällige Verteilung der Sync-Aufrufe
      syncBillingCounterIfNeeded();
    }
  }
}

// Initialisierung
Timer.set(1000, false, function() {
  checkAndCreateVirtualComponent(componentName, desiredDayId, function(idDay) {
    compIdDay = idDay;
    Timer.set(200, false, function() {
      checkAndCreateVirtualComponent(monthlyComponentName, desiredMonthId, function(idMonth) {
        compIdMonth = idMonth;
        Timer.set(200, false, function() {
          checkAndCreateVirtualComponent(yearlyComponentName, desiredYearId, function(idYear) {
            compIdYear = idYear;
            Timer.set(200, false, function() {
              checkAndCreateVirtualComponent(billingComponentName, desiredBillingId, function(idBilling) {
                compIdBilling = idBilling;
                Timer.set(200, false, function() {
                  checkAndCreateVirtualButton("Reset " + billingComponentName, desiredBillingId + 100, function(bId) {
                    buttonIdBilling = bId;
                    setupBillingResetButton();

                    // Werte laden mit Verzögerungen
                    Timer.set(500, false, function() {
                      LoadVirtualComponentValue(compIdDay, function(vDay) {
                        energyConsumedKWh = vDay;
                        Timer.set(100, false, function() {
                          LoadVirtualComponentValue(compIdMonth, function(vMonth) {
                            energyConsumedMonthlyKWh = vMonth;
                            Timer.set(100, false, function() {
                              LoadVirtualComponentValue(compIdYear, function(vYear) {
                                energyConsumedYearlyKWh = vYear;
                                Timer.set(100, false, function() {
                                  LoadVirtualComponentValue(compIdBilling, function(vBill) {
                                    energyConsumedBillingKWh = vBill;
                                    
                                    if (log > 0) {
                                      print("Geladene Werte:");
                                      print("- Tagesverbrauch:", energyConsumedKWh.toFixed(3), "kWh");
                                      print("- Monatsverbrauch:", energyConsumedMonthlyKWh.toFixed(3), "kWh"); 
                                      print("- Jahresverbrauch:", energyConsumedYearlyKWh.toFixed(3), "kWh");
                                      print("- Abrechnungszeitraum:", energyConsumedBillingKWh.toFixed(3), "kWh");
                                      print("--------------------");
                                    }

                                    // Starte Timer mit initialem Sync nach 10 Sekunden
                                    Timer.set(10000, false, function() {
                                      syncBillingCounterIfNeeded();
                                    });

                                    Timer.set(1000, true, timerHandler, {
                                      saveAccum: 0, logAccum: 0, resetAccum: 0, lastTick: Date.now()
                                    });
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
