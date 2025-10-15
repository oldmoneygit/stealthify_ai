'use client';

interface AnalysisProgressProps {
  currentPhase: number; // 1-6
  phaseLabel?: string;
}

export function AnalysisProgress({
  currentPhase,
  phaseLabel
}: AnalysisProgressProps) {
  const phases = [
    { num: 1, label: 'Camuflando título', emoji: '📝' },
    { num: 2, label: 'Detectando marcas', emoji: '🔍' },
    { num: 3, label: 'Criando máscaras', emoji: '🎯' },
    { num: 4, label: 'Removendo logos', emoji: '✨' },
    { num: 5, label: 'Verificando', emoji: '🔎' },
    { num: 6, label: 'Finalizando', emoji: '✅' }
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        🔄 Análise em Progresso
      </h3>

      <div className="space-y-3">
        {phases.map((phase) => {
          const isCompleted = phase.num < currentPhase;
          const isCurrent = phase.num === currentPhase;
          const isPending = phase.num > currentPhase;

          return (
            <div
              key={phase.num}
              className={`
                flex items-center gap-3 p-3 rounded-lg transition-all
                ${isCompleted ? 'bg-green-50 border border-green-200' : ''}
                ${isCurrent ? 'bg-blue-50 border border-blue-200 animate-pulse' : ''}
                ${isPending ? 'bg-gray-50 border border-gray-200 opacity-60' : ''}
              `}
            >
              <span className="text-2xl">{phase.emoji}</span>

              <div className="flex-1">
                <p className={`
                  font-medium
                  ${isCompleted ? 'text-green-900' : ''}
                  ${isCurrent ? 'text-blue-900' : ''}
                  ${isPending ? 'text-gray-500' : ''}
                `}>
                  [{phase.num}/6] {phase.label}
                </p>
                {isCurrent && phaseLabel && (
                  <p className="text-sm text-blue-600 mt-1">{phaseLabel}</p>
                )}
              </div>

              <div>
                {isCompleted && (
                  <span className="text-green-600 text-xl">✅</span>
                )}
                {isCurrent && (
                  <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
                {isPending && (
                  <span className="text-gray-400 text-xl">⏳</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress Bar */}
      <div className="pt-4">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
          <span>Progresso</span>
          <span>{Math.round((currentPhase / 6) * 100)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${(currentPhase / 6) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
