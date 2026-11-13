// 1. INPUTS SETUP
const incentiveId = {{ sel_debugIncentive.value }}; 
if (!incentiveId) return [];

const incentive = {{ incentives_by_id.data }}[incentiveId];
const system = {{ active_system_row.value }};
const houseData = {{ house.data }};
const customerData = {{ customer.data ? customer.data[0] : {} }};

const ahriRecord = (formatDataAsArray({{ debugAhriLookup.data }})[0]) || {};

const allLineItems = {{ line_items_by_system.value }}; 
const equipmentData = {{ equipment_by_id.data }};
const laborData = {{ labor_by_id.data }};

const systemLineItems = allLineItems.filter(li => li.system_id === system.id);

let equipmentArray = systemLineItems.reduce((acc,item) => {
    let equipmentRecord = equipmentData[item.equipment_id];
    if(equipmentRecord) acc.push(equipmentRecord);
    return acc;
},[]);

let laborArray = systemLineItems.reduce((acc,item) => {
    let laborRecord = laborData[item.labor_id];
    if(laborRecord) acc.push(laborRecord);
    return acc;
},[]);

// 2. LOGIC & REPORTING ENGINE
let report = [];

/* --------------------------------------------------
   TIER EXTRACTION FOR GROUPING
-------------------------------------------------- */
function extractTier(category) {
  const match = category?.match(/Tier\s\d+/);
  return match ? match[0] : "System Check";
}

/* --------------------------------------------------
   FUZZY NESTED VALUE GETTER
-------------------------------------------------- */
function getInnerValue(obj, path) {
    if (!obj) return undefined;
    let keys = path.split('.');
    let current = obj;
    
    for (let key of keys) {
        if (current === undefined || current === null) return undefined;
        
        if (current[key] !== undefined) {
            current = current[key];
            continue;
        }
        
        if (typeof current === 'object' && !Array.isArray(current)) {
            const cleanKey = key.replace(/_/g, '').toLowerCase();
            const foundKey = Object.keys(current).find(k => 
              k.replace(/_/g, '').toLowerCase() === cleanKey
            );
            
            if (foundKey) {
                current = current[foundKey];
                continue;
            }
        }
        
        return undefined;
    }
    return current;
}

/* --------------------------------------------------
   CRITERIA CHECKER
-------------------------------------------------- */
function checkCriterion(checkValue, dataValue) {

    if(!Array.isArray(checkValue) && Array.isArray(dataValue) && dataValue.length === 1)
      dataValue = dataValue[0];

    let isMet = false;
    let operation = "Equals";

    if (typeof checkValue === 'string') {
      const regex = /^(>=|>|<=|<|==|=)/;
      const operator = checkValue.match(regex);

      if (operator) {
        operation = operator[0];
        const strippedValue = Number(checkValue.replace(regex, ''));
        const numData = Number(dataValue); 
        
        if(!isNaN(numData)) {
            switch (operator[0]) { 
              case '>=': isMet = numData >= strippedValue; break;
              case '>':  isMet = numData > strippedValue; break;
              case '<=': isMet = numData <= strippedValue; break;
              case '<':  isMet = numData < strippedValue; break;
              case '==':
              case '=':  isMet = numData == strippedValue; break;
            }
        }
      } else {
         if (typeof dataValue === 'string' && checkValue.includes(',')) {
             operation = "One Of";
             isMet = checkValue
                .split(',')
                .map(s=>s.trim().toLowerCase())
                .includes(String(dataValue).toLowerCase());
         } else {
             isMet = String(dataValue).toLowerCase() ==
                     String(checkValue).toLowerCase();
         }
      }
    }
    else if (typeof checkValue === 'boolean' || typeof checkValue === 'number'){
      isMet = dataValue == checkValue;
    }
    else if (Array.isArray(checkValue)) {
      operation = "Includes";
      isMet = checkValue.some(cv =>
        String(cv).toLowerCase() == String(dataValue).toLowerCase()
      );
    }

    return { isMet, operation };
}

/* --------------------------------------------------
   CRITERIA LOOP
-------------------------------------------------- */
function checkCriteria(criteria, data, categoryName) {
    Object.keys(criteria).forEach((criterionKey) => {
      const checkValue = criteria[criterionKey];
      const dataValue = getInnerValue(data, criterionKey);
      
      if (typeof checkValue === 'object' && !Array.isArray(checkValue)) {
         if (typeof dataValue === 'object' && !Array.isArray(dataValue))
           checkCriteria(checkValue, dataValue, categoryName + "." + criterionKey);
         else
           report.push({
               category: categoryName,
               parameter: criterionKey,
               required: "Nested Data",
               actual: "Missing Data Structure",
               status: "Fail"
           });
      } else {
        const result = checkCriterion(checkValue, dataValue);
        
        report.push({
            category: categoryName,
            parameter: criterionKey,
            required: typeof checkValue === 'object'
                      ? JSON.stringify(checkValue)
                      : String(checkValue),
            actual: dataValue !== undefined
                    ? String(dataValue)
                    : "Not Found (undefined)",
            status: result.isMet ? "Pass" : "Fail",
            operation: result.operation
        });
      }
    });
}

/* --------------------------------------------------
   MAIN EXECUTION
-------------------------------------------------- */
try {

    if (!incentive || !incentive.incentive_criteria)
      return [{
        tier: "Error",
        category: "Error",
        parameter: "Selection",
        required: "-",
        actual: "Incentive not found or no criteria",
        status: "Error"
      }];
    
    let criteriaJSON = typeof incentive.incentive_criteria === 'string' 
        ? JSON.parse(incentive.incentive_criteria) 
        : incentive.incentive_criteria;

    const typeMatch = incentive.system_type === system.system_type;

    report.push({
        category: "System Check",
        parameter: "system_type",
        required: incentive.system_type,
        actual: system.system_type,
        status: typeMatch ? "Pass" : "Fail"
    });

    if (!typeMatch) {
      return report.map(r => ({
        ...r,
        tier: extractTier(r.category)
      }));
    }

    Object.values(criteriaJSON).forEach((option, index) => {

        if(!option.criteria) return;

        let tierName = `Tier ${index + 1}`;
        
        Object.keys(option.criteria).forEach(key => {

            let rules = option.criteria[key];
            
            if(key === 'equipment'){
                 if(equipmentArray.length === 0) {
                     report.push({
                       category: tierName,
                       parameter: "Equipment",
                       actual: "No Equipment",
                       status: "Fail"
                     });
                 } else {
                     equipmentArray.forEach(equip => {
                         checkCriteria(rules, equip, `${tierName} - Equipment`);
                     });
                 }
            } 
            else if (key === 'labor') {
                laborArray.forEach(labor => {
                     checkCriteria(rules, labor, `${tierName} - Labor`);
                 });
            }
            else if (key === 'home' || key === 'house') {
                checkCriteria(rules, houseData, `${tierName} - House`);
            }
            else if (key === 'customer') {
                checkCriteria(rules, customerData, `${tierName} - Customer`);
            }
            else if (key === 'ahri') {
                checkCriteria(rules, ahriRecord, `${tierName} - AHRI`);
            }
            else if (key === 'system') {
                checkCriteria(rules, system, `${tierName} - System`);
            }
        });
        
        if (option.amount) {
             report.push({
                category: tierName,
                parameter: "Amount Logic",
                required: option.amount.multiplier_type || "Flat",
                actual: option.amount.max_amount || option.amount.multiplier_value,
                status: "Info"
            });
        }
    });

} catch (error) {
    report.push({
      category: "Error",
      parameter: "Script Crash",
      actual: error.message,
      status: "CRITICAL"
    });
}

/* --------------------------------------------------
   FINAL RETURN (WITH TIER FIELD)
-------------------------------------------------- */

return report.map(r => ({
  ...r,
  tier: extractTier(r.category)
}));