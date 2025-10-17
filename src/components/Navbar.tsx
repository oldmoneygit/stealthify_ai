'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: '🏠 Dashboard', icon: '🏠' },
    { href: '/blur-review', label: '🔄 Revisão & Reedição', icon: '🔄' },
    { href: '/title-editor', label: '✏️ Editor de Títulos', icon: '✏️' },
    { href: '/watermark-settings', label: '💧 Marca d\'Água', icon: '💧' },
    { href: '/shopify-import', label: '🛍️ Importar Shopify', icon: '🛍️' },
    { href: '/batch', label: '🚀 Processamento', icon: '🚀' },
    { href: '/setup', label: '⚙️ Configurações', icon: '⚙️' },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <Link href="/" className="flex items-center gap-3 font-bold text-xl text-gray-900 hover:text-blue-600 transition-colors">
            <span className="text-2xl">🎭</span>
            <span>Brand Camouflage</span>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-2">
            {links.map((link) => {
              const isActive = pathname === link.href;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    px-4 py-2 rounded-lg font-medium transition-all duration-200
                    flex items-center gap-2
                    ${isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-blue-600'
                    }
                  `}
                >
                  <span>{link.icon}</span>
                  <span className="hidden md:inline">{link.label.split(' ').slice(1).join(' ')}</span>
                </Link>
              );
            })}
          </div>

          {/* Stats Badge (optional) */}
          <div className="hidden lg:flex items-center gap-2 text-sm text-gray-600">
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium">
              ✨ Sistema Ativo
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
