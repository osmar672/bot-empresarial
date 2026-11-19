import { useState } from "react";
import AttendanceCard from "../components/AttendanceCard.jsx";
import Corrections from "../components/Corrections.jsx";

export default function Workday({ onRequests }) {
  const [correcting, setCorrecting] = useState(false);

  return (
    <div className="page workspace-page">
      <div className="page-heading">
        <h1>Mi jornada</h1>
        <button className="btn btn-secondary" onClick={onRequests}>Mis solicitudes</button>
      </div>
      <AttendanceCard onCorrection={() => setCorrecting(value => !value)}
        correcting={correcting}
        correctionForm={correcting && <Corrections />}
      />
    </div>
  );
}
