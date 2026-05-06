export const SANDWICH_COMBOS = [
  { cantidad: 12, precioCentavos: 3800, nombre: "Combo 12 sandwiches", premiumExtraCentavos: 30 }
];

const PREMIUM_SANDWICH_IDS = new Set(["atun-palta-queso", "salmon-phil", "especial-semanal"]);

function isSandwich(item) {
  return item.categoriaId === "sandwiches" && item.controlaStock;
}

function isPremiumSandwich(item) {
  return isSandwich(item) && (item.sandwichTipo === "premium" || PREMIUM_SANDWICH_IDS.has(item.id));
}

function expandedSandwichUnits(lines) {
  return lines
    .filter(isSandwich)
    .flatMap((item) =>
      Array.from({ length: item.quantity }, () => ({
        precioCentavos: item.precioCentavos,
        isPremium: isPremiumSandwich(item)
      }))
        .map((unit, index) => ({
          ...unit,
          order: item.unitOrders?.[index] ?? Number.MAX_SAFE_INTEGER
        }))
    )
    .sort((a, b) => a.order - b.order);
}

function premiumExtraCharge(comboUnits, combo) {
  if (!combo.premiumExtraCentavos) return 0;
  const premiumUnits = comboUnits.filter((item) => item.isPremium).length;
  return premiumUnits * combo.premiumExtraCentavos;
}

function comboSelection(units, combo) {
  const comboUnits = units.slice(0, combo.cantidad);
  const comboPremiumQuantity = comboUnits.filter((item) => item.isPremium).length;
  if (comboUnits.length < combo.cantidad) return null;
  if (!combo.premiumExtraCentavos && comboPremiumQuantity > combo.maxPremium) return null;

  const comboNormalCentavos = comboUnits.reduce((total, item) => total + item.precioCentavos, 0);
  const totalSandwichCentavos = units.reduce((total, item) => total + item.precioCentavos, 0);
  const premiumExtraCentavos = premiumExtraCharge(comboUnits, combo);
  return {
    comboNormalCentavos,
    extraSandwichCentavos: totalSandwichCentavos - comboNormalCentavos,
    comboPremiumQuantity,
    premiumExtraCentavos
  };
}

export function calculateCartPricing(items) {
  const lines = Array.from(items || []);
  const normalTotalCentavos = lines.reduce((total, item) => total + item.precioCentavos * item.quantity, 0);
  const sandwichLines = lines.filter(isSandwich);
  const sandwichQuantity = sandwichLines.reduce((total, item) => total + item.quantity, 0);
  const sandwichNormalCentavos = sandwichLines.reduce((total, item) => total + item.precioCentavos * item.quantity, 0);
  const nonSandwichCentavos = normalTotalCentavos - sandwichNormalCentavos;
  const sandwichUnits = expandedSandwichUnits(lines);
  const combo = SANDWICH_COMBOS.find((rule) => {
    if (sandwichQuantity < rule.cantidad) return false;
    return comboSelection(sandwichUnits, rule) !== null;
  });

  if (!combo) {
    const blockedCombo = SANDWICH_COMBOS.find((rule) => sandwichQuantity >= rule.cantidad);
    const blockedPremiumQuantity = blockedCombo ? sandwichUnits.filter((item) => item.isPremium).length : 0;
    return {
      normalTotalCentavos,
      totalCentavos: normalTotalCentavos,
      discountCentavos: 0,
      combo: null,
      sandwichQuantity,
      premiumQuantity: blockedPremiumQuantity,
      warning: blockedCombo
        ? blockedCombo.premiumExtraCentavos
          ? ""
          : `${blockedCombo.nombre} admite maximo ${blockedCombo.maxPremium} premium.`
        : ""
    };
  }

  const selection = comboSelection(sandwichUnits, combo);
  const comboNormalCentavos = selection.comboNormalCentavos;
  const extraSandwichCentavos = selection.extraSandwichCentavos;
  const comboChargedCentavos = combo.precioCentavos + selection.premiumExtraCentavos;
  const totalCentavos = nonSandwichCentavos + comboChargedCentavos + extraSandwichCentavos;
  return {
    normalTotalCentavos,
    totalCentavos,
    discountCentavos: Math.max(0, normalTotalCentavos - totalCentavos),
    combo: { ...combo, precioCentavos: comboChargedCentavos },
    comboNormalCentavos,
    extraSandwichCentavos,
    sandwichQuantity,
    premiumQuantity: selection.comboPremiumQuantity,
    warning: ""
  };
}
