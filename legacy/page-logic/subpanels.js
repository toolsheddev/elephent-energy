function createSubpanelobject(n) {
  let subpanels = {};

  for (let i = 0; i < n; i++) {
    subpanels[`subpanel${i + 1}`] = {
        index: i,
        location: {{subpanelLoc}}[i].value,
        amperage: {{subpanelAmp}}[i].value,
        open_breakers: {{numofOpenBreakerSpacesSubpanel}}[i].value
  }
};

  return { subpanels }; 
}

const numberOfSubpanels = {{subpanelList.instances}};
const subs = createSubpanelobject(numberOfSubpanels);

return subs;