import { useState } from "react";
import { Plus } from "lucide-react";
import Corrections from "../components/Corrections.jsx";
import Onboarding from "../components/Onboarding.jsx";
import PermissionRequests from "../components/PermissionRequests.jsx";
import VacationCard from "../components/VacationCard.jsx";
import { LeaveBalance } from "../components/LeavePolicy.jsx";

const requestTypes = [
  { id: "vacation", label: "Vacaciones", Component: VacationCard },
  { id: "permission", label: "Permiso por horas", Component: PermissionRequests },
  { id: "correction", label: "Corrección de marcación", Component: Corrections },
];

export default function Requests() {
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState("");

  function toggleRequest() {
    setType("");
    setCreating(value => !value);
  }

  return (
    <div className="page workspace-page">
      <div className="page-heading">
        <h1>Mis solicitudes</h1>
        <button className={creating ? "btn btn-secondary" : "btn btn-primary"}
          onClick={toggleRequest} aria-expanded={creating} aria-controls="request-type">
          {!creating && <Plus size={16} />}
          {creating ? "Cerrar formulario" : "Nueva solicitud"}
        </button>
      </div>
      <div id="request-type" hidden={!creating}>
        <label className="field workspace-request-type">
          Tipo de solicitud
          <select value={type} onChange={event => setType(event.target.value)}>
            <option value="">Elige un tipo</option>
            {requestTypes.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="workspace-request-list">
        {requestTypes.map(({ id, Component }) => (
          <div key={id} hidden={creating && id !== type}>
            <Component showForm={creating && id === type} />
          </div>
        ))}
        <div hidden={creating}>
          <details className="workspace-balance">
            <summary>Movimientos del saldo de vacaciones</summary>
            <LeaveBalance />
          </details>
          <Onboarding />
        </div>
      </div>
    </div>
  );
}
