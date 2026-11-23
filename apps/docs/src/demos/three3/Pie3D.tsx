import { useState } from 'react';
import { Pie3DChart } from '@rsc-gl/3d/react';
import { useDemoScheme } from '../util';

const traffic = [
  { label: 'Search', value: 42 },
  { label: 'Direct', value: 26 },
  { label: 'Social', value: 14 },
  { label: 'Email', value: 9 },
  { label: 'Referral', value: 6 },
  { label: 'Other', value: 3 },
];

export default function Pie3D() {
  const scheme = useDemoScheme();
  const [rose, setRose] = useState(false);
  return (
    <div>
      <button className="btn" style={{ marginBottom: 10 }} onClick={() => setRose((r) => !r)}>
        {rose ? 'Even height' : 'Height by value'}
      </button>
      <div className="row">
        <Pie3DChart height={360} colorScheme={scheme} data={traffic} heightByValue={rose} camera={{ elevation: 38, distance: 3.4 }} />
        <Pie3DChart height={360} colorScheme={scheme} data={traffic} innerRadius={0.55} heightByValue={rose} explode={0.05} camera={{ elevation: 30, distance: 3.4, autoRotate: true, autoRotateSpeed: 10 }} />
      </div>
    </div>
  );
}
