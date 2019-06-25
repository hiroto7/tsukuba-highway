import React from 'react';
import { Card, ListGroup } from 'react-bootstrap';

const RoadList: React.FC<{ roads: Iterable<string>, selected?: string, onClick: (road: string) => void }> = props => (
  <Card>{
    <ListGroup variant="flush">
      {
        [...props.roads].map((road: string) => (
          <ListGroup.Item action active={road === props.selected} key={road} onClick={() => props.onClick(road)}>{road}</ListGroup.Item>
        ))
      }
    </ListGroup>
  }</Card>
)

export default RoadList;