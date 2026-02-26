import { createSignal, onSettled } from "solid-js";
const Home = () => {
  const [s, set] = createSignal(0);
  onSettled(() => {
    const t = setInterval(() => {
      const newVal = s() + 1;
      set(newVal);
    }, 100);
    return () => {
      clearInterval(t);
    };
  });
  return (
    <Wrapper>
      <h1>Welcome to this Simple Routing Example</h1>
      <p>Click the links in the Navigation above to load different routes.</p>
      <span>{s()}</span>
    </Wrapper>
  );
};

function Wrapper(props) {
  return <>{props.children}</>;
}

export default Home;
