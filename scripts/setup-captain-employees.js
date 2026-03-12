#!/usr/bin/env node
// Setup Captain Employees on Odoo for Multi-Captain POS
// Targets: ops.hamzahotel.com (dev/test) — DO NOT run against test.hamzahotel.com (production)
// Usage: node scripts/setup-captain-employees.js

const RPC_URL = 'https://ops.hamzahotel.com/jsonrpc';
const DB = 'main';
const UID = 2;
const API_KEY = '9ee27d7da807853f1d36b0d4967b73878c090d4c';
const CAPTAIN_POS_CONFIG = 6;

async function rpc(model, method, args, kwargs = {}) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: 1,
      params: { service: 'object', method: 'execute_kw',
        args: [DB, UID, API_KEY, model, method, args, kwargs] },
    }),
  });
  const json = await res.json();
  if (json.error) {
    const msg = json.error?.data?.message || json.error.message || 'unknown';
    throw new Error(`RPC [${model}.${method}]: ${msg}`.substring(0, 500));
  }
  return json.result;
}

const CAPTAINS_TO_CREATE = [
  { name: 'HE Captain 01', pin: '2101' },
  { name: 'HE Captain 02', pin: '2102' },
  { name: 'HE Captain 03', pin: '2103' },
  { name: 'HE Captain 04', pin: '2104' },
  { name: 'HE Captain 05', pin: '2105' },
];

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  CAPTAIN EMPLOYEE SETUP — ops.hamzahotel.com');
  console.log('══════════════════════════════════════════════════════════\n');

  // ── Step 1: Check existing captain employees ──
  console.log('── Step 1: Check existing employees ──');
  const existing = await rpc('hr.employee', 'search_read',
    [[['name', 'ilike', 'HE Captain']]],
    { fields: ['id', 'name', 'pin', 'job_title'] });

  if (existing.length > 0) {
    console.log('  Found existing captain employees:');
    for (const e of existing) {
      console.log(`    [${e.id}] ${e.name} — PIN: ${e.pin} — ${e.job_title || 'no title'}`);
    }
  } else {
    console.log('  No existing captain employees found');
  }

  // ── Step 2: Create missing employees ──
  console.log('\n── Step 2: Create captain employees ──');
  const employeeIds = {};
  const existingNames = new Set(existing.map(e => e.name));

  for (const cap of CAPTAINS_TO_CREATE) {
    if (existingNames.has(cap.name)) {
      const match = existing.find(e => e.name === cap.name);
      console.log(`  ${cap.name} already exists (ID ${match.id}), skipping`);
      employeeIds[cap.name] = match.id;
      continue;
    }

    const empId = await rpc('hr.employee', 'create', [{
      name: cap.name,
      company_id: 1,
      pin: cap.pin,
      job_title: 'Floor Captain',
    }]);
    console.log(`  Created ${cap.name} — ID: ${empId}, PIN: ${cap.pin}`);
    employeeIds[cap.name] = empId;
  }

  // ── Step 3: Read current POS config 6 ──
  console.log('\n── Step 3: Read POS config 6 ──');
  const configs = await rpc('pos.config', 'read', [[CAPTAIN_POS_CONFIG],
    ['name', 'module_pos_hr', 'basic_employee_ids', 'advanced_employee_ids',
     'payment_method_ids']]);

  if (!configs || configs.length === 0) {
    console.error('  ERROR: POS config 6 not found!');
    process.exit(1);
  }

  const config = configs[0];
  console.log(`  Name: ${config.name}`);
  console.log(`  module_pos_hr: ${config.module_pos_hr}`);
  console.log(`  basic_employee_ids: [${config.basic_employee_ids}]`);
  console.log(`  advanced_employee_ids: [${config.advanced_employee_ids}]`);
  console.log(`  payment_method_ids: [${config.payment_method_ids}]`);

  // ── Step 4: Enable module_pos_hr on config 6 ──
  console.log('\n── Step 4: Enable multi-employee mode on config 6 ──');
  if (config.module_pos_hr) {
    console.log('  Already enabled');
  } else {
    await rpc('pos.config', 'write', [[CAPTAIN_POS_CONFIG], {
      module_pos_hr: true,
    }]);
    console.log('  Enabled module_pos_hr = true');
  }

  // ── Step 5: Add all captains to basic_employee_ids ──
  console.log('\n── Step 5: Add captains to basic_employee_ids ──');
  const allEmpIds = Object.values(employeeIds);
  const existingBasic = new Set(config.basic_employee_ids || []);

  for (const [name, empId] of Object.entries(employeeIds)) {
    if (existingBasic.has(empId)) {
      console.log(`  ${name} (${empId}) already in basic_employee_ids`);
    } else {
      await rpc('pos.config', 'write', [[CAPTAIN_POS_CONFIG], {
        basic_employee_ids: [[4, empId, false]],  // link existing
      }]);
      console.log(`  Added ${name} (${empId}) to basic_employee_ids`);
    }
  }

  // ── Step 6: Check/create UPI payment methods for captains 4 & 5 ──
  console.log('\n── Step 6: Check UPI payment methods ──');

  // Existing PMs: Captain 01 = 52, Captain 02 = 53, Captain 03 = 54
  const existingPMs = await rpc('pos.payment.method', 'search_read',
    [[['name', 'ilike', 'Captain']]],
    { fields: ['id', 'name', 'type'] });

  console.log('  Existing captain payment methods:');
  for (const pm of existingPMs) {
    console.log(`    [${pm.id}] ${pm.name} (${pm.type})`);
  }

  const pmNames = new Set(existingPMs.map(p => p.name));
  const newPMs = [
    { name: 'HE Captain 04 UPI', type: 'bank' },
    { name: 'HE Captain 05 UPI', type: 'bank' },
  ];

  for (const pm of newPMs) {
    if (pmNames.has(pm.name)) {
      const match = existingPMs.find(p => p.name === pm.name);
      console.log(`  ${pm.name} already exists (ID ${match.id})`);
      continue;
    }
    const pmId = await rpc('pos.payment.method', 'create', [{
      name: pm.name,
      type: pm.type,
      company_id: 1,
    }]);
    console.log(`  Created ${pm.name} — ID: ${pmId}`);

    // Add to config 6's payment methods
    await rpc('pos.config', 'write', [[CAPTAIN_POS_CONFIG], {
      payment_method_ids: [[4, pmId, false]],
    }]);
    console.log(`    Added to config 6 payment_method_ids`);
  }

  // ── Step 7: Verify final state ──
  console.log('\n── Step 7: Verify final POS config 6 ──');
  const finalConfig = await rpc('pos.config', 'read', [[CAPTAIN_POS_CONFIG],
    ['name', 'module_pos_hr', 'basic_employee_ids', 'advanced_employee_ids',
     'payment_method_ids']]);

  const fc = finalConfig[0];
  console.log(`  module_pos_hr: ${fc.module_pos_hr}`);
  console.log(`  basic_employee_ids: [${fc.basic_employee_ids}]`);
  console.log(`  advanced_employee_ids: [${fc.advanced_employee_ids}]`);
  console.log(`  payment_method_ids: [${fc.payment_method_ids}]`);

  // ── Step 8: Read all payment methods on config 6 ──
  console.log('\n── Step 8: All payment methods on config 6 ──');
  const allPMs = await rpc('pos.payment.method', 'search_read',
    [[['id', 'in', fc.payment_method_ids]]],
    { fields: ['id', 'name', 'type'] });
  for (const pm of allPMs) {
    console.log(`  [${pm.id}] ${pm.name} (${pm.type})`);
  }

  // ── Step 9: Test employee_id on pos.order fields ──
  console.log('\n── Step 9: Verify pos.order has employee_id field ──');
  try {
    const fields = await rpc('pos.order', 'fields_get', [],
      { attributes: ['string', 'type'], allfields: false });
    if (fields.employee_id) {
      console.log(`  employee_id: ${fields.employee_id.string} (${fields.employee_id.type})`);
    } else {
      console.log('  WARNING: employee_id field NOT found on pos.order!');
    }
    if (fields.cashier) {
      console.log(`  cashier: ${fields.cashier.string} (${fields.cashier.type})`);
    }
  } catch (e) {
    console.log('  Could not inspect fields:', e.message.substring(0, 200));
  }

  // ── Summary ──
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  SUMMARY — Copy these into settlement.js CAPTAINS config');
  console.log('══════════════════════════════════════════════════════════\n');

  for (const cap of CAPTAINS_TO_CREATE) {
    const empId = employeeIds[cap.name];
    console.log(`  ${cap.name}: employeeId=${empId}, PIN=${cap.pin}`);
  }

  console.log('\n  UPI Payment Methods:');
  const finalPMs = await rpc('pos.payment.method', 'search_read',
    [[['name', 'ilike', 'Captain']]],
    { fields: ['id', 'name'] });
  for (const pm of finalPMs) {
    console.log(`    [${pm.id}] ${pm.name}`);
  }

  console.log('\n  Next steps:');
  console.log('  1. Open POS config 6 on ops.hamzahotel.com');
  console.log('  2. Verify "Select Employee" screen appears');
  console.log('  3. Select a captain, create a test order');
  console.log('  4. Query: pos.order WHERE id = X, fields: [employee_id]');
  console.log('  5. Create Razorpay QRs for Captain 04 & 05');
  console.log('  6. Update settlement.js CAPTAINS with employee IDs + PM IDs');
  console.log('\n  DONE\n');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
