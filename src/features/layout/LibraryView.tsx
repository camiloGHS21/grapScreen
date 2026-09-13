import React from "react";
import { Plus, Library, ChevronLeft, ChevronRight, MoreVertical, Trash2 } from "lucide-react";
import { Project } from "../../types";

interface LibraryViewProps {
  paginatedProjects: Project[];
  filteredProjects: Project[];
  projects: Project[];
  loading: boolean;
  search: string;
  setSearch: (s: string) => void;
  sortBy: "recent" | "az" | "za" | "most";
  setSortBy: (s: "recent" | "az" | "za" | "most") => void;
  setCreateOpen: (open: boolean) => void;
  selectProject: (p: Project) => void;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  getPageNumbers: () => (number | string)[];
  removeProj: (p: Project) => void;
  menu: string | null;
  setMenu: (m: string | null) => void;
}

export function LibraryView({
  paginatedProjects,
  filteredProjects,
  projects,
  loading,
  search,
  setSearch,
  sortBy,
  setSortBy,
  setCreateOpen,
  selectProject,
  currentPage,
  setCurrentPage,
  totalPages,
  getPageNumbers,
  removeProj,
  menu,
  setMenu
}: LibraryViewProps) {
  return (
    <div className="library-view">
      <header>
        <div>
          <small>AUTOMATIZACIÓN LOCAL</small>
          <h1>Repite menos.<br />Automatiza mejor.</h1>
          <p>Captura teclado, mouse y pantalla. Reproduce el flujo cuando quieras.</p>
          <div className="search-wrapper">
            <input
              className="search"
              placeholder="Buscar proyectos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="filter-bar">
              <button className={`filter-chip ${sortBy === "recent" ? "active" : ""}`} onClick={() => setSortBy("recent")}>Recientes</button>
              <button className={`filter-chip ${sortBy === "az" ? "active" : ""}`} onClick={() => setSortBy("az")}>A-Z</button>
              <button className={`filter-chip ${sortBy === "za" ? "active" : ""}`} onClick={() => setSortBy("za")}>Z-A</button>
              <button className={`filter-chip ${sortBy === "most" ? "active" : ""}`} onClick={() => setSortBy("most")}>Más grabaciones</button>
            </div>
          </div>
        </div>
      </header>

      <section className="section-head">
        <div>
          <h2>Tu biblioteca</h2>
          <p>{filteredProjects.length} de {projects.length} proyectos</p>
        </div>
        {!loading && projects.length > 0 && (
          <button className="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={18} /> Nuevo proyecto
          </button>
        )}
      </section>

      {loading ? (
        <div className="skeletons">
          <i /><i /><i />
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="empty">
          <Library />
          <h3>Aquí empieza tu primer flujo</h3>
          <p>Crea un proyecto para empezar a grabar una tarea repetitiva.</p>
          <button className="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={18} />Crear proyecto
          </button>
        </div>
      ) : (
        <div className="grid">
          {paginatedProjects.map((project) => (
            <article
              key={project.name}
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter") selectProject(project); }}
              onClick={() => selectProject(project)}
              style={{ cursor: 'pointer' }}
            >
              <div className="card-top">
                <span className="badge">Proyecto</span>
                <button
                  className="icon"
                  aria-label="Opciones"
                  onClick={e => {
                    e.stopPropagation();
                    setMenu(menu === project.name ? null : project.name);
                  }}
                >
                  <MoreVertical />
                </button>
              </div>
              {menu === project.name && (
                <div className="menu" onClick={e => e.stopPropagation()}>
                  <button className="danger" onClick={() => { setMenu(null); removeProj(project); }}>
                    <Trash2 size={12} /> Eliminar
                  </button>
                </div>
              )}
              <div>
                <h3>{project.name}</h3>
                <p className="meta">
                  <span>{(project.automations || []).length} automatizaciones</span>
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="pagination">
          <button className="pagination-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
            <ChevronLeft size={16} />
          </button>
          {getPageNumbers().map((page, idx) => (
            page === '...' ? (
              <span key={'ellipsis-' + idx} className="pagination-ellipsis">...</span>
            ) : (
              <button
                key={page}
                className={'pagination-btn' + (page === currentPage ? ' active' : '')}
                onClick={() => setCurrentPage(page as number)}
              >
                {page}
              </button>
            )
          ))}
          <button className="pagination-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
