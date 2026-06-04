import { createContext, useContext, useState } from "react";

interface NewOrdersContextValue {
  newOrderCount: number;
  addNewOrders: (count: number) => void;
  clearNewOrders: () => void;
}

const NewOrdersContext = createContext<NewOrdersContextValue>({
  newOrderCount: 0,
  addNewOrders: () => {},
  clearNewOrders: () => {},
});

export function NewOrdersProvider({ children }: { children: React.ReactNode }) {
  const [newOrderCount, setNewOrderCount] = useState(0);

  const addNewOrders = (count: number) => {
    if (count > 0) setNewOrderCount((prev) => prev + count);
  };

  const clearNewOrders = () => setNewOrderCount(0);

  return (
    <NewOrdersContext.Provider value={{ newOrderCount, addNewOrders, clearNewOrders }}>
      {children}
    </NewOrdersContext.Provider>
  );
}

export function useNewOrders() {
  return useContext(NewOrdersContext);
}
