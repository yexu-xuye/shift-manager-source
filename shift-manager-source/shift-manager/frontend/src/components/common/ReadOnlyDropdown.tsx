import { Autocomplete, TextField } from '@mui/material';

interface ReadOnlyDropdownProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  getOptionLabel?: (v: string) => string;
  placeholder?: string;
  /** 空值显示的标签；设置后空值会作为可选「空」项加入列表 */
  emptyLabel?: string;
}

/**
 * 只读下拉框：不可输入文字、无清除按钮、点击展开列表、点击外部关闭。
 */
export default function ReadOnlyDropdown({
  value,
  onChange,
  options,
  getOptionLabel,
  placeholder = '请选择',
  emptyLabel,
}: ReadOnlyDropdownProps) {
  const allOptions = emptyLabel !== undefined ? ['', ...options] : options;
  const labelOf = (v: string) => {
    if (v === '' && emptyLabel !== undefined) return emptyLabel;
    return getOptionLabel ? getOptionLabel(v) : v;
  };

  return (
    <Autocomplete
      value={emptyLabel !== undefined ? value : value || null}
      onChange={(_, v) => onChange(v ?? '')}
      options={allOptions}
      getOptionLabel={labelOf}
      disableClearable
      openOnFocus
      selectOnFocus={false}
      fullWidth
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          placeholder={placeholder}
          inputProps={{ ...params.inputProps, readOnly: true, style: { cursor: 'pointer' } }}
        />
      )}
    />
  );
}
