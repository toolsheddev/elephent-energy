const lineItems = {{ finalized_line_items.value}};

const referralDiscount = lineItems.filter(item => item.line_item_type === 'discount' && item.discount_id === 5).reduce((acc, item) => acc + item.price_actual, 0);

return referralDiscount;