select
  *
from
  systems_new
where
  proposal_id = {{project.data.finalized_proposal_id}}
and system_status in ('proposed', 'active - from change order')