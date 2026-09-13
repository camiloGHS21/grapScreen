import React from "react";
import { Gauge, Sparkles, FlaskConical, ArrowUpRight } from "lucide-react";

interface EvaluationsViewProps {
  automationId: string;
}

/**
 * Evaluations — mirrors n8n's "Evaluations" tab.
 *
 * The engine does not yet produce evaluation datasets, so this is an honest
 * empty state plus a short explanation of what will land here. It keeps the
 * tab meaningful instead of dead.
 */
export function EvaluationsView({ automationId: _automationId }: EvaluationsViewProps) {
  const PLANNED = [
    {
      icon: FlaskConical,
      title: "Datasets de prueba",
      desc: "Define entradas esperadas y salidas correctas para medir el flujo.",
    },
    {
      icon: Gauge,
      title: "Puntuación automática",
      desc: "Compara la salida real con la esperada en cada ejecución.",
    },
    {
      icon: Sparkles,
      title: "Métricas de IA",
      desc: "Relevancia, exactitud y consistencia de los nodos de IA.",
    },
  ];

  return (
    <div className="eval-view">
      <div className="eval-hero">
        <div className="eval-hero-icon">
          <Gauge size={22} />
        </div>
        <h3>Evaluaciones</h3>
        <p>
          Mide la calidad de tu flujo con datasets y puntuaciones automáticas,
          igual que n8n. Aún no hay evaluaciones configuradas para este flujo.
        </p>
      </div>

      <div className="eval-grid">
        {PLANNED.map((p) => (
          <div className="eval-card" key={p.title}>
            <span className="eval-card-icon"><p.icon size={16} /></span>
            <div className="eval-card-body">
              <div className="eval-card-title">
                {p.title}
                <ArrowUpRight size={12} className="eval-soon-arrow" />
              </div>
              <div className="eval-card-desc">{p.desc}</div>
            </div>
            <span className="eval-badge">próximamente</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default EvaluationsView;
