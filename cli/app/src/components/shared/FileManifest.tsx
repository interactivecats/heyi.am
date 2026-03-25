interface FileEntry {
  name: string
  desc?: string
  indent?: number
}

interface FileManifestProps {
  path: string
  files: FileEntry[]
  footer?: string
}

export function FileManifest({ path, files, footer }: FileManifestProps) {
  return (
    <div className="bg-surface-dark text-[#d4dae0] rounded-md p-4 font-mono text-xs">
      <div className="text-[#7eb8e6] mb-2">{path}</div>
      <div className="space-y-0.5">
        {files.map((file) => (
          <div
            key={file.name}
            className="flex justify-between"
            style={{ paddingLeft: `${(file.indent ?? 0) * 12}px` }}
          >
            <span>{file.name}</span>
            {file.desc && (
              <span className="text-[#6b7280] ml-4 shrink-0">{file.desc}</span>
            )}
          </div>
        ))}
      </div>
      {footer && (
        <div className="mt-3 pt-2 border-t border-[#2a2e33] text-[#6b7280]">
          {footer}
        </div>
      )}
    </div>
  )
}
