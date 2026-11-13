for (const templateId of filter_system_types.value.checklist_template_ids) {
  await companycamChecklists.trigger({
    additionalScope: {
      checklist_template_id: templateId
    }
  });
}
